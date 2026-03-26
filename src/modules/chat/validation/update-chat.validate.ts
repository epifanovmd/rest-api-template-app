import { z } from "zod";

export const UpdateChatSchema = z.object({
  name: z
    .string()
    .min(1, "Название обязательно")
    .max(100, "Название не должно превышать 100 символов")
    .optional(),
  avatarId: z.string().uuid("Некорректный UUID").nullable().optional(),
});
