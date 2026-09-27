import { z } from "zod";

export const CreateDirectChatSchema = z.object({
  targetUserId: z.string().uuid("Некорректный UUID"),
});
