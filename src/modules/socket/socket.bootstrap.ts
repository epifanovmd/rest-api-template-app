import { inject, multiInject } from "inversify";

import { IBootstrap, Injectable, logger } from "../../core";
import { TSocket } from "./socket.types";
import { SocketAuthMiddleware } from "./socket-auth.middleware";
import { SocketClientRegistry } from "./socket-client-registry";
import {
  ISocketEventListener,
  SOCKET_EVENT_LISTENER,
} from "./socket-event-listener.interface";
import { ISocketHandler, SOCKET_HANDLER } from "./socket-handler.interface";
import { SocketServerService } from "./socket-server.service";

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

      this.clientRegistry.register(user.userId, socket);
      socket.join(`user_${user.userId}`);
      socket.emit("authenticated", { userId: user.userId });

      // Передаём управление domain-хендлерам
      await Promise.all(this.handlers.map(h => h.onConnection(socket)));

      socket.on("error", err => {
        logger.error({ err, userId: user.userId }, "[Socket] Socket error");
        socket.disconnect(true);
      });

      socket.on("disconnect", reason => {
        logger.info(
          { userId: user.userId, reason },
          "[Socket] User disconnected",
        );
        this.clientRegistry.unregister(user.userId);
      });
    });

    // 3. Регистрируем все EventBus-слушатели (уведомления, rooms, push)
    for (const listener of this.eventListeners) {
      listener.register();
    }
  }

  async destroy(): Promise<void> {
    await this.serverService.close();
  }
}
