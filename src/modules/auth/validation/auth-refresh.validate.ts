import { z } from "zod";

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh токен не может быть пустым"),
});
