import { z } from "zod";

import { WEBHOOK_EVENT_TYPES } from "../webhook.service";

export const SetWebhookEventsSchema = z.object({
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .max(WEBHOOK_EVENT_TYPES.length),
});
