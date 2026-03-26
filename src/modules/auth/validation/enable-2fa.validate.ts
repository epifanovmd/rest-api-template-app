import { z } from "zod";

export const Enable2FASchema = z.object({
  password: z
    .string()
    .min(4, "Пароль должен содержать минимум 4 символа")
    .max(100, "Пароль не должен превышать 100 символов"),
  hint: z
    .string()
    .max(100, "Подсказка не должна превышать 100 символов")
    .optional(),
});
