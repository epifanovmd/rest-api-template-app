import { z } from "zod";

export const DemoEchoSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  lookup: z.boolean().optional(),
  long: z.boolean().optional(),
  steps: z.number().int().min(1).max(100).optional(),
  delayMs: z.number().int().min(0).max(10_000).optional(),
  fail: z.boolean().optional(),
  withOutput: z.boolean().optional(),
});
