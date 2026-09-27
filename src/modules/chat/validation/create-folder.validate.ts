import { z } from "zod";

export const CreateFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Название не может быть пустым")
    .max(50, "Название не должно превышать 50 символов"),
});
