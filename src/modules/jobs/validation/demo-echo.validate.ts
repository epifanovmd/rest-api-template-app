import { z } from "zod";

export const DemoEchoSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  withOutput: z.boolean().optional(),
  sleep: z.number().min(0).max(60).optional(),
  fail: z.enum(["retry", "fatal"]).optional(),
});
