import { z } from "zod";

export const UserUpdateSchema = z
  .object({
    email: z
      .email("Неверный формат email")
      .max(50, "Email не должен превышать 50 символов")
      .transform(val => val?.trim().toLowerCase())
      .optional(),

    phone: z
      .string()
      .regex(/^\+7\d{10}$|^8\d{10}$/, {
        message: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX",
      })
      .transform(val => {
        if (!val) return val;
        // Нормализуем номер телефона
        const cleaned = val.replace(/\D/g, "");

        if (cleaned.startsWith("8") && cleaned.length === 11) {
          return "+7" + cleaned.substring(1);
        }
        if (cleaned.length === 10) {
          return "+7" + cleaned;
        }

        return val;
      })
      .optional(),

    roleId: z.uuid("ID роли должен быть валидным UUID").optional(),

    challenge: z
      .string()
      .min(10, "Challenge должен содержать минимум 10 символов")
      .max(255, "Challenge не должен превышать 255 символов")
      .regex(/^[a-zA-Z0-9_-]+$/, {
        message:
          "Challenge может содержать только буквы, цифры, дефисы и подчеркивания",
      })
      .optional(),
  })
  .refine(data => data.email || data.phone || data.roleId || data.challenge, {
    message: "Должно быть указано хотя бы одно поле для обновления",
    path: ["general"],
  });
