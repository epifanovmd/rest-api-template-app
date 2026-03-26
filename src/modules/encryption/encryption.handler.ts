import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, SocketEmitterService, TSocket } from "../socket";

@Injectable()
export class EncryptionHandler implements ISocketHandler {
  constructor(
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("e2e:key-exchange", ({ chatId, targetUserId, keyBundle }) => {
      this._emitter.toUser(targetUserId, "e2e:key-exchange", {
        chatId,
        fromUserId: socket.data.userId,
        keyBundle,
      });
    });

    socket.on("e2e:ratchet", ({ chatId, newPublicKey }) => {
      // Broadcast to chat room except sender
      socket.to(`chat_${chatId}`).emit("e2e:ratchet", {
        chatId,
        fromUserId: socket.data.userId,
        newPublicKey,
      });
    });
  }
}
