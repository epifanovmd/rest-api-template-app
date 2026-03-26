import { z } from "zod";

export const CreateInviteSchema = z.object({
  expiresAt: z.string().datetime("Некорректный формат даты").optional(),
  maxUses: z.number().int().positive("Должно быть положительным числом").optional(),
});
