import { z } from "zod";

export const SetSlowModeSchema = z.object({
  seconds: z
    .number()
    .int("Значение должно быть целым числом")
    .min(0, "Минимум 0 секунд")
    .max(86400, "Максимум 86400 секунд (24 часа)"),
});

export const BanMemberSchema = z.object({
  duration: z
    .number()
    .int("Значение должно быть целым числом")
    .min(0, "Минимум 0 секунд")
    .optional(),
  reason: z
    .string()
    .max(500, "Причина не должна превышать 500 символов")
    .optional(),
});
