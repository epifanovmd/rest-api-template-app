import { z } from "zod";

export const MarkReadSchema = z.object({
  messageId: z.string().uuid("Некорректный UUID"),
});
