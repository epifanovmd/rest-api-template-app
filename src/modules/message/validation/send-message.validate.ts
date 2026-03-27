import { z } from "zod";

import { EMessageType } from "../message.types";

export const SendMessageSchema = z
  .object({
    type: z.nativeEnum(EMessageType).default(EMessageType.TEXT),
    content: z
      .string()
      .trim()
      .min(1, "Сообщение не должно быть пустым")
      .max(4000, "Сообщение не должно превышать 4000 символов")
      .optional(),
    replyToId: z.string().uuid("Некорректный UUID").optional(),
    forwardedFromId: z.string().uuid("Некорректный UUID").optional(),
    fileIds: z
      .array(z.string().uuid("Некорректный UUID"))
      .max(10, "Максимум 10 вложений")
      .optional(),
    mentionedUserIds: z
      .array(z.string().uuid("Некорректный UUID"))
      .max(50, "Максимум 50 упоминаний")
      .optional(),
    mentionAll: z.boolean().optional(),
    stickerId: z.string().uuid("Некорректный UUID").optional(),
    encryptedContent: z.string().optional(),
    encryptionMetadata: z.record(z.string(), z.unknown()).optional(),
    scheduledAt: z.string().datetime("Некорректная дата").optional(),
    selfDestructSeconds: z
      .number()
      .int()
      .min(1, "Минимум 1 секунда")
      .max(604800, "Максимум 7 дней")
      .optional(),
  })
  .refine(
    data =>
      data.content ||
      (data.fileIds && data.fileIds.length > 0) ||
      data.stickerId,
    {
    message: "Необходимо указать текст или прикрепить файл",
    path: ["content"],
  });
