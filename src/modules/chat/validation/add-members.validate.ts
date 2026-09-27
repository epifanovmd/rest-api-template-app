import { z } from "zod";

export const AddMembersSchema = z.object({
  memberIds: z
    .array(z.string().uuid("Некорректный UUID"))
    .min(1, "Необходимо добавить хотя бы одного участника"),
});
