import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, TSocket } from "../socket";
import { ChatMemberRepository } from "./chat-member.repository";

@Injectable()
export class ChatHandler implements ISocketHandler {
  constructor(
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("chat:join", async ({ chatId }) => {
      try {
        const membership = await this._memberRepo.findMembership(
          chatId,
          socket.data.userId,
        );

        if (membership) {
          socket.join(`chat_${chatId}`);
        }
      } catch (error) {
        socket.emit("error", {
          event: "chat:join",
          message: "Failed to join chat",
        });
      }
    });

    socket.on("chat:leave", ({ chatId }) => {
      socket.leave(`chat_${chatId}`);
    });

    // ── Typing rooms ────────────────────────────────────────────────

    socket.on("typing:subscribe", async ({ chatIds }) => {
      for (const chatId of chatIds) {
        socket.join(`typing_${chatId}`);
      }
    });

    socket.on("typing:unsubscribe", ({ chatIds }) => {
      for (const chatId of chatIds) {
        socket.leave(`typing_${chatId}`);
      }
    });

    socket.on("chat:typing", ({ chatId }) => {
      const payload = {
        chatId,
        userId: socket.data.userId,
      };

      // Full chat room (for users with the chat open)
      socket.to(`chat_${chatId}`).emit("chat:typing", payload);

      // Lightweight typing room (for chat list indicators)
      socket.to(`typing_${chatId}`).emit("chat:typing", payload);
    });
  }
}
