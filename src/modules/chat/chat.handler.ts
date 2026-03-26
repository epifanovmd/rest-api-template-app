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
      const membership = await this._memberRepo.findMembership(
        chatId,
        socket.data.userId,
      );

      if (membership) {
        socket.join(`chat_${chatId}`);
      }
    });

    socket.on("chat:leave", ({ chatId }) => {
      socket.leave(`chat_${chatId}`);
    });

    socket.on("chat:typing", ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit("chat:typing", {
        chatId,
        userId: socket.data.userId,
      });
    });
  }
}
