import { inject, multiInject } from "inversify";

import { IBootstrap, Injectable, logger } from "../core";
import {
  ISocketEventListener,
  ISocketHandler,
  SOCKET_EVENT_LISTENER,
  SOCKET_HANDLER,
  SocketAuthMiddleware,
  SocketClientRegistry,
  SocketServerService,
  TSocket,
} from "../modules/socket";

@Injectable()
export class SocketBootstrap implements IBootstrap {
  constructor(
    @inject(SocketServerService)
    private readonly serverService: SocketServerService,
    @inject(SocketAuthMiddleware)
    private readonly authMiddleware: SocketAuthMiddleware,
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
    @multiInject(SOCKET_HANDLER)
    private readonly handlers: ISocketHandler[],
    @multiInject(SOCKET_EVENT_LISTENER)
    private readonly eventListeners: ISocketEventListener[],
  ) {}

  async initialize(): Promise<void> {
    const { io } = this.serverService;

    // 1. JWT-аутентификация при подключении
    io.use(this.authMiddleware.handle);

    // 2. Жизненный цикл соединения
    io.on("connection", async (socket: TSocket) => {
      const user = socket.data;

      this.clientRegistry.register(user.id, socket);
      socket.join(`user_${user.id}`);
      socket.emit("authenticated", { userId: user.id });

      // Передаём управление domain-хендлерам
      await Promise.all(this.handlers.map(h => h.onConnection(socket)));

      socket.on("error", err => {
        logger.error({ err, userId: user.id }, "[Socket] Socket error");
        socket.disconnect(true);
      });

      socket.on("disconnect", reason => {
        logger.info({ userId: user.id, reason }, "[Socket] User disconnected");
        this.clientRegistry.unregister(user.id);
      });
    });

    // 3. Регистрируем все EventBus-слушатели (уведомления, rooms, push)
    for (const listener of this.eventListeners) {
      listener.register();
    }

    // 4. Запускаем сервер
    await this.serverService.listen();
  }

  async destroy(): Promise<void> {
    await this.serverService.close();
  }
}
