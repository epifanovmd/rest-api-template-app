import { z } from "zod";

export const SetCommandsSchema = z.object({
  commands: z
    .array(
      z.object({
        command: z.string().min(1).max(50),
        description: z.string().min(1).max(200),
      }),
    )
    .max(50),
});
