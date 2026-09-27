import { z } from "zod";

export const CreateBotSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,50}$/,
      "Username: 3-50 символов, только буквы, цифры и _",
    ),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
