import { z } from "zod";

export const TransferOwnershipSchema = z.object({
  userId: z.string().uuid("Некорректный UUID"),
});
