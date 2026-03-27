import { z } from "zod";

export const Disable2FASchema = z.object({
  password: z
    .string()
    .min(4, "Пароль должен содержать минимум 4 символа")
    .max(100, "Пароль не должен превышать 100 символов"),
});
