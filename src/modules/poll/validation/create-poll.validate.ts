import { z } from "zod";

export const CreatePollSchema = z.object({
  question: z
    .string()
    .min(1, "Вопрос обязателен")
    .max(300, "Вопрос не должен превышать 300 символов"),
  options: z
    .array(
      z
        .string()
        .min(1, "Вариант не должен быть пустым")
        .max(100, "Вариант не должен превышать 100 символов"),
    )
    .min(2, "Минимум 2 варианта ответа")
    .max(10, "Максимум 10 вариантов ответа"),
  isAnonymous: z.boolean().optional().default(false),
  isMultipleChoice: z.boolean().optional().default(false),
});

export const VotePollSchema = z.object({
  optionIds: z
    .array(z.string().uuid("Некорректный UUID"))
    .min(1, "Необходимо выбрать хотя бы один вариант"),
});
