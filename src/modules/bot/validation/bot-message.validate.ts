import { z } from "zod";

import { EMessageType } from "../../message";

/** Предел длины текста сообщения бота. */
export const BOT_MESSAGE_MAX_LENGTH = 4000;

const content = z
  .string()
  .trim()
  .min(1, "Текст сообщения обязателен")
  .max(BOT_MESSAGE_MAX_LENGTH, `Не более ${BOT_MESSAGE_MAX_LENGTH} символов`);

export const BotSendMessageSchema = z.object({
  chatId: z.string().uuid("Некорректный UUID"),
  type: z.literal(EMessageType.TEXT).default(EMessageType.TEXT),
  content,
  replyToId: z.string().uuid("Некорректный UUID").optional(),
});

export const BotEditMessageSchema = z.object({ content });
