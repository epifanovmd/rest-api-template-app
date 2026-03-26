import { z } from "zod";

export const CreateChannelSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  description: z.string().max(500).optional(),
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,50}$/,
      "Username: 3-50 символов, только буквы, цифры и _",
    )
    .optional(),
  avatarId: z.string().uuid().optional(),
  isPublic: z.boolean().default(false),
});
