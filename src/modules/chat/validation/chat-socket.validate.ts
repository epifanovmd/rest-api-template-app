import { z } from "zod";

/** Сколько typing-комнат можно подписать одним событием. */
export const MAX_TYPING_ROOMS = 200;

const chatId = z.string().uuid("Некорректный UUID");

/** `chat:join`, `chat:leave`, `chat:typing`. */
export const SocketChatRoomSchema = z.object({ chatId });

/** `typing:subscribe`, `typing:unsubscribe`. */
export const SocketTypingRoomsSchema = z.object({
  chatIds: z
    .array(chatId)
    .max(MAX_TYPING_ROOMS, `Не больше ${MAX_TYPING_ROOMS} чатов`),
});
