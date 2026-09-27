import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, onValidated, TSocket } from "../socket";
import { ChatError } from "./chat.errors";
import { ChatMemberRepository } from "./chat-member.repository";
import {
  SocketChatRoomSchema,
  SocketTypingRoomsSchema,
} from "./validation/chat-socket.validate";

/** Лимиты частоты событий на сокет (token bucket). */
export const CHAT_SOCKET_LIMITS = {
  room: { perSecond: 10, burst: 20 },
  typingRooms: { perSecond: 2, burst: 5 },
  typing: { perSecond: 2 },
} as const;

@Injectable()
export class ChatHandler implements ISocketHandler {
  constructor(
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
  ) {}

  onConnection(socket: TSocket): void {
    const { userId } = socket.data;

    /** Участник ли пользователь сокета: комната чата уже есть или членство в БД. */
    const isMember = async (chatId: string) => {
      if (
        socket.rooms.has(`chat_${chatId}`) ||
        socket.rooms.has(`typing_${chatId}`)
      ) {
        return true;
      }

      return !!(await this._memberRepo.findMembership(chatId, userId));
    };

    onValidated(
      socket,
      "chat:join",
      SocketChatRoomSchema,
      async ({ chatId }) => {
        if (!(await this._memberRepo.findMembership(chatId, userId))) {
          throw ChatError.NOT_MEMBER();
        }

        socket.join(`chat_${chatId}`);
      },
      { rateLimit: CHAT_SOCKET_LIMITS.room },
    );

    onValidated(
      socket,
      "chat:leave",
      SocketChatRoomSchema,
      ({ chatId }) => {
        socket.leave(`chat_${chatId}`);
      },
      { rateLimit: CHAT_SOCKET_LIMITS.room },
    );

    onValidated(
      socket,
      "typing:subscribe",
      SocketTypingRoomsSchema,
      async ({ chatIds }) => {
        const allowed = await this._memberRepo.filterMemberChatIds(
          userId,
          chatIds,
        );

        for (const chatId of allowed) {
          socket.join(`typing_${chatId}`);
        }
      },
      { rateLimit: CHAT_SOCKET_LIMITS.typingRooms },
    );

    onValidated(
      socket,
      "typing:unsubscribe",
      SocketTypingRoomsSchema,
      ({ chatIds }) => {
        for (const chatId of chatIds) {
          socket.leave(`typing_${chatId}`);
        }
      },
      { rateLimit: CHAT_SOCKET_LIMITS.typingRooms },
    );

    onValidated(
      socket,
      "chat:typing",
      SocketChatRoomSchema,
      async ({ chatId }) => {
        // Не участник — молча: typing не должен порождать ответный трафик.
        if (!(await isMember(chatId))) return;

        const payload = { chatId, userId };

        // Комната чата (открытый чат) и лёгкая typing-комната (список чатов)
        socket.to(`chat_${chatId}`).emit("chat:typing", payload);
        socket.to(`typing_${chatId}`).emit("chat:typing", payload);
      },
      { rateLimit: CHAT_SOCKET_LIMITS.typing },
    );
  }
}
