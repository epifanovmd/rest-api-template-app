import { inject, injectable, multiInject } from "inversify";

import { IBootstrap, logger } from "../core";
import { DialogRoomManager, DialogSocketEventHandler } from "../modules/dialog";
import { PushNotificationListener } from "../modules/fcm-token";
import {
  ISocketHandler,
  SOCKET_HANDLER,
  SocketAuthMiddleware,
  SocketClientRegistry,
  SocketServerService,
  TSocket,
} from "../modules/socket";

@injectable()
export class SocketBootstrap implements IBootstrap {
  constructor(
    @inject(SocketServerService)
    private readonly serverService: SocketServerService,
    @inject(SocketAuthMiddleware)
    private readonly authMiddleware: SocketAuthMiddleware,
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
    @inject(DialogSocketEventHandler)
    private readonly socketEventHandler: DialogSocketEventHandler,
    @inject(DialogRoomManager)
    private readonly roomManager: DialogRoomManager,
    @inject(PushNotificationListener)
    private readonly pushListener: PushNotificationListener,
    @multiInject(SOCKET_HANDLER)
    private readonly handlers: ISocketHandler[],
  ) {}

  async initialize(): Promise<void> {
    const { io } = this.serverService;

    // 1. Auth — верифицирует JWT и кладёт User в socket.data
    io.use(this.authMiddleware.handle);

    // 2. Connection lifecycle
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

    // 3. EventBus → Socket (outbound notifications)
    this.socketEventHandler.register();

    // 4. EventBus → Room management (реактивный join/leave)
    this.roomManager.register();

    // 5. EventBus → Push notifications (FCM)
    this.pushListener.register();

    // 5. Start
    await this.serverService.listen();
  }

  async destroy(): Promise<void> {
    await this.serverService.close();
  }
}
