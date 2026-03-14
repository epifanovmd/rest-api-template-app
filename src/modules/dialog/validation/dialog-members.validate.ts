import { z } from "zod";

const uuid = z.uuid("Должен быть валидным UUID");

export const AddMembersSchema = z.object({
  dialogId: uuid,
  members: z.array(uuid).min(1, "Необходимо указать хотя бы одного участника"),
});
