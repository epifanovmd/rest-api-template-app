import { z } from "zod";

export const AddReactionSchema = z.object({
  emoji: z.string().min(1).max(20),
});
