import { z } from "zod";

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,50}$/)
    .nullable()
    .optional(),
  avatarId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().optional(),
});
