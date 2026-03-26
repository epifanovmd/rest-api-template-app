import { z } from "zod";

import { EMessageType } from "../message.types";

export const SendMessageSchema = z
  .object({
    type: z.nativeEnum(EMessageType).default(EMessageType.TEXT),
    content: z
      .string()
      .max(4000, "Сообщение не должно превышать 4000 символов")
      .optional(),
    replyToId: z.string().uuid("Некорректный UUID").optional(),
    forwardedFromId: z.string().uuid("Некорректный UUID").optional(),
    fileIds: z
      .array(z.string().uuid("Некорректный UUID"))
      .max(10, "Максимум 10 вложений")
      .optional(),
  })
  .refine(data => data.content || (data.fileIds && data.fileIds.length > 0), {
    message: "Необходимо указать текст или прикрепить файл",
    path: ["content"],
  });
