import { z } from "zod";

export const ChangePasswordSchema = z.object({
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(100, "Пароль не должен превышать 100 символов"),
});
