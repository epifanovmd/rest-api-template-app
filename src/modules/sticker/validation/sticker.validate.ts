import { z } from "zod";

export const CreateStickerPackSchema = z.object({
  name: z
    .string()
    .min(1, "Имя обязательно")
    .max(100, "Имя не должно превышать 100 символов")
    .regex(/^[a-zA-Z0-9_-]+$/, "Имя может содержать только латиницу, цифры, _ и -"),
  title: z
    .string()
    .min(1, "Заголовок обязателен")
    .max(200, "Заголовок не должен превышать 200 символов"),
  isAnimated: z.boolean().optional().default(false),
});

export const AddStickerToPackSchema = z.object({
  emoji: z
    .string()
    .max(10, "Эмодзи не должно превышать 10 символов")
    .optional(),
  fileId: z.string().uuid("Некорректный UUID файла"),
});
