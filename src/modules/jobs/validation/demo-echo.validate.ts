import { z } from "zod";

export const DemoEchoSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  withOutput: z.boolean().optional(),
});
