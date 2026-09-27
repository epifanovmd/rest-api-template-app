import { z } from "zod";

export const EditMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Сообщение не может быть пустым")
    .max(4000, "Сообщение не должно превышать 4000 символов"),
});
