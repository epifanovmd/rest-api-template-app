import { z } from "zod";

export const SignUpSchema = z
  .object({
    password: z
      .string()
      .min(6, "Пароль должен содержать минимум 6 символов")
      .max(100, "Пароль не должен превышать 100 символов"),
    firstName: z
      .string()
      .max(50, "Имя не должно превышать 50 символов")
      .optional(),
    lastName: z
      .string()
      .max(50, "Фамилия не должна превышать 50 символов")
      .optional(),
    email: z
      .email("Неверный формат email")
      .max(50, "Email не должен превышать 50 символов")
      .transform(val => val.trim().toLowerCase())
      .optional(),
    phone: z
      .string()
      .regex(/^\+7\d{10}$|^8\d{10}$/, {
        message: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX",
      })
      .optional(),
  })
  .refine(data => data.email || data.phone, {
    message: "Необходимо указать email или телефон",
    path: ["email"],
  });
