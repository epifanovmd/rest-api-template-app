import { z } from "zod";

/** Сколько сообщений можно отметить одним событием. */
export const MAX_RECEIPT_BATCH = 200;

const uuid = z.string().uuid("Некорректный UUID");
const messageIds = z
  .array(uuid)
  .max(MAX_RECEIPT_BATCH, `Не больше ${MAX_RECEIPT_BATCH} сообщений`);

/**
 * `message:read`. Старый формат с одиночным `messageId` сворачивается в
 * `messageIds`.
 */
export const SocketMessageReadSchema = z
  .object({
    chatId: uuid,
    messageIds: messageIds.optional(),
    messageId: uuid.optional(),
  })
  .transform(({ chatId, messageIds: ids, messageId }) => ({
    chatId,
    messageIds: ids ?? (messageId ? [messageId] : []),
  }));

/** `message:delivered`. */
export const SocketMessageDeliveredSchema = z.object({
  chatId: uuid,
  messageIds,
});
