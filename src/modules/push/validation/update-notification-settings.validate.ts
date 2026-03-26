import { z } from "zod";

export const UpdateNotificationSettingsSchema = z.object({
  muteAll: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  showPreview: z.boolean().optional(),
});
