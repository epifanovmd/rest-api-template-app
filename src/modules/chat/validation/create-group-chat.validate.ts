import { z } from "zod";

export const CreateGroupChatSchema = z.object({
  name: z
    .string()
    .min(1, "Название обязательно")
    .max(100, "Название не должно превышать 100 символов"),
  memberIds: z
    .array(z.string().uuid("Некорректный UUID"))
    .min(1, "Необходимо добавить хотя бы одного участника"),
  avatarId: z.string().uuid("Некорректный UUID").optional(),
});
