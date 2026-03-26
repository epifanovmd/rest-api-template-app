import { z } from "zod";

export const MuteChatSchema = z.object({
  mutedUntil: z
    .string()
    .datetime("Некорректный формат даты")
    .nullable(),
});
