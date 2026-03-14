import { z } from "zod";

export const RequestResetPasswordSchema = z.object({
  login: z
    .string()
    .min(1, "Логин не может быть пустым")
    .max(100, "Логин не должен превышать 100 символов"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Токен не может быть пустым"),
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(100, "Пароль не должен превышать 100 символов"),
});
