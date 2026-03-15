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
  })
  .refine(data => data.email || data.phone || data.roleId, {
    message: "Должно быть указано хотя бы одно поле для обновления",
    path: ["general"],
  });
