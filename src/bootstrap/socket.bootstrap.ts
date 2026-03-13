import { inject, injectable, multiInject } from "inversify";

import { IBootstrap } from "../core";
import { DialogRoomManager } from "../modules/dialog";
import { DialogSocketEventHandler } from "../modules/dialog";
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
        console.error(`[Socket] Error for user ${user.id}:`, err);
        socket.disconnect(true);
      });

      socket.on("disconnect", reason => {
        console.info(`[Socket] User ${user.id} disconnected: ${reason}`);
        this.clientRegistry.unregister(user.id);
      });
    });

    // 3. EventBus → Socket (outbound notifications)
    this.socketEventHandler.register();

    // 4. EventBus → Room management (реактивный join/leave)
    this.roomManager.register();

    // 5. Start
    await this.serverService.listen();
  }

  async destroy(): Promise<void> {
    await this.serverService.close();
  }
}
