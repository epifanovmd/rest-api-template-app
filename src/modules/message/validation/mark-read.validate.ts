import { z } from "zod";

export const MarkReadSchema = z.object({
  messageIds: z
    .array(z.string().uuid("Некорректный UUID"))
    .min(1, "Необходимо указать хотя бы один messageId"),
});
