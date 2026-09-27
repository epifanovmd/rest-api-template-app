import { z } from "zod";

export const CreateContactSchema = z.object({
  contactUserId: z.string().uuid("Некорректный UUID"),
  displayName: z
    .string()
    .max(80, "Имя не должно превышать 80 символов")
    .optional(),
});
