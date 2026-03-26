import { z } from "zod";

export const SetWebhookSchema = z.object({
  url: z.string().url().max(500),
  secret: z.string().max(100).optional(),
});
