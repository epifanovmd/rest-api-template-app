import { z } from "zod";

const uuid = z.uuid("Должен быть валидным UUID");

export const DialogFindSchema = z.object({
  recipientId: z
    .array(uuid)
    .min(1, "Необходимо указать хотя бы одного получателя"),
});

export const DialogCreateSchema = z.object({
  recipientId: z
    .array(uuid)
    .min(1, "Необходимо указать хотя бы одного получателя"),
});
