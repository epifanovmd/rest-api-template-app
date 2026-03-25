import { inject, multiInject } from "inversify";

import { EventBus, IBootstrap, Injectable, logger } from "../../core";
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
    @inject(EventBus)
    private readonly eventBus: EventBus,
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

      // Регистрируем соединение (для проверки isOnline)
      this.clientRegistry.register(user.userId, socket);
      // Личная room пользователя — через неё доставляются все push-уведомления.
      // SocketEmitterService.toUser() использует io.to('user_${userId}'),
      // поэтому все соединения (несколько вкладок/устройств) получат событие.
      socket.join(`user_${user.userId}`);
      socket.emit("authenticated", { userId: user.userId });

      // Передаём управление domain-хендлерам
      const results = await Promise.allSettled(
        this.handlers.map(h => h.onConnection(socket)),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          logger.error(
            { err: result.reason, userId: user.userId },
            "[Socket] Handler onConnection failed",
          );
        }
      }

      socket.on("error", err => {
        logger.error({ err, userId: user.userId }, "[Socket] Socket error");
        socket.disconnect(true);
      });

      socket.on("disconnect", reason => {
        logger.info(
          { userId: user.userId, reason },
          "[Socket] User disconnected",
        );
        // Удаляем именно это соединение; остальные соединения пользователя остаются
        this.clientRegistry.unregister(user.userId, socket);
      });
    });

    // 3. Регистрируем все EventBus-слушатели (уведомления, rooms, push)
    for (const listener of this.eventListeners) {
      try {
        listener.register();
      } catch (error) {
        logger.error(
          { err: error },
          `[Socket] Event listener registration failed: ${listener.constructor.name}`,
        );
      }
    }
  }

  async destroy(): Promise<void> {
    // Снимаем все EventBus-подписки перед закрытием
    this.eventBus.clear();
    await this.serverService.close();
  }
}
