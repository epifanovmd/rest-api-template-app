import { z } from "zod";

const uuid = z.uuid("Должен быть валидным UUID");

export const NewMessageSchema = z.object({
  dialogId: uuid,
  text: z
    .string()
    .min(1, "Текст сообщения не может быть пустым")
    .max(5000, "Текст сообщения не должен превышать 5000 символов"),
  system: z.boolean().optional(),
  received: z.boolean().optional(),
  replyId: uuid.nullable().optional(),
  imageIds: z.array(uuid).optional(),
  videoIds: z.array(uuid).optional(),
  audioIds: z.array(uuid).optional(),
});

export const UpdateMessageSchema = z.object({
  text: z
    .string()
    .min(1, "Текст сообщения не может быть пустым")
    .max(5000, "Текст сообщения не должен превышать 5000 символов")
    .optional(),
  system: z.boolean().optional(),
  received: z.boolean().optional(),
  replyId: uuid.nullable().optional(),
  imageIds: z.array(uuid).optional(),
  videoIds: z.array(uuid).optional(),
  audioIds: z.array(uuid).optional(),
  deleteFileIds: z.array(uuid).optional(),
});
