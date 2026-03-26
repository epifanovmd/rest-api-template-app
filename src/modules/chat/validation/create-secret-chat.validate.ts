import { z } from "zod";

export const CreateSecretChatSchema = z.object({
  targetUserId: z.string().uuid("Некорректный UUID"),
});
