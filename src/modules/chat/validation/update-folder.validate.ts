import { z } from "zod";

export const UpdateFolderSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Название не может быть пустым")
      .max(50, "Название не должно превышать 50 символов")
      .optional(),
    position: z
      .number()
      .int("Позиция должна быть целым числом")
      .min(0, "Позиция не может быть отрицательной")
      .optional(),
  })
  .refine(data => data.name !== undefined || data.position !== undefined, {
    message: "Нужно указать name или position",
  });
