import { z } from "zod";

export const Verify2FASchema = z.object({
  twoFactorToken: z
    .string()
    .min(1, "Токен обязателен"),
  password: z
    .string()
    .min(4, "Пароль должен содержать минимум 4 символа")
    .max(100, "Пароль не должен превышать 100 символов"),
});
