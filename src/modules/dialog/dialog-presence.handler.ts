import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, SocketClientRegistry, TSocket } from "../socket";

/**
 * Отвечает за presence-статус пользователей в диалогах:
 * - broadcast online/offline по всем dialog-rooms сокета
 * - синхронный ответ на checkOnline
 */
@Injectable()
export class DialogPresenceHandler implements ISocketHandler {
  constructor(
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
  ) {}

  onConnection(socket: TSocket): void {
    const { userId } = socket.data;

    socket.on("online", (isOnline: boolean) => {
      socket.rooms.forEach(room => {
        if (room.startsWith("dialog_")) {
          socket.to(room).emit("online", { userId, isOnline });
        }
      });
    });

    socket.on(
      "checkOnline",
      (targetUserId: string, callback: (isOnline: boolean) => void) => {
        callback(this.clientRegistry.isOnline(targetUserId));
      },
    );
  }
}
