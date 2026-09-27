import { z } from "zod";

import { DIRECT_UPLOAD_MAX_BYTES } from "../file.types";

export const CreateUploadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Имя файла обязательно")
    .max(255, "Имя файла не должно превышать 255 символов"),
  size: z
    .number()
    .int("Размер должен быть целым числом")
    .positive("Размер должен быть больше нуля")
    .max(DIRECT_UPLOAD_MAX_BYTES, "Файл превышает допустимый размер"),
  contentType: z
    .string()
    .min(1, "Тип файла обязателен")
    .max(127, "Тип файла не должен превышать 127 символов"),
});
