import { inject } from "inversify";

import { Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ISocketHandler, SocketEmitterService, TSocket } from "../socket";

@Injectable()
export class EncryptionHandler implements ISocketHandler {
  constructor(
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("e2e:key-exchange", async ({ chatId, targetUserId, keyBundle }) => {
      try {
        const senderMembership = await this._memberRepo.findMembership(
          chatId,
          socket.data.userId,
        );

        if (!senderMembership) {
          socket.emit("error", {
            event: "e2e:key-exchange",
            message: "Not a member of this chat",
          });

          return;
        }

        const targetMembership = await this._memberRepo.findMembership(
          chatId,
          targetUserId,
        );

        if (!targetMembership) {
          socket.emit("error", {
            event: "e2e:key-exchange",
            message: "Target user is not a member of this chat",
          });

          return;
        }

        this._emitter.toUser(targetUserId, "e2e:key-exchange", {
          chatId,
          fromUserId: socket.data.userId,
          keyBundle,
        });
      } catch (error) {
        socket.emit("error", {
          event: "e2e:key-exchange",
          message: "Failed to process key exchange",
        });
      }
    });

    socket.on("e2e:ratchet", async ({ chatId, newPublicKey }) => {
      try {
        const membership = await this._memberRepo.findMembership(
          chatId,
          socket.data.userId,
        );

        if (!membership) {
          socket.emit("error", {
            event: "e2e:ratchet",
            message: "Not a member of this chat",
          });

          return;
        }

        // Broadcast to chat room except sender
        socket.to(`chat_${chatId}`).emit("e2e:ratchet", {
          chatId,
          fromUserId: socket.data.userId,
          newPublicKey,
        });
      } catch (error) {
        socket.emit("error", {
          event: "e2e:ratchet",
          message: "Failed to process ratchet",
        });
      }
    });
  }
}
