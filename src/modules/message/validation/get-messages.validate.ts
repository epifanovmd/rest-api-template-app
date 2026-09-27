import { z } from "zod";

import { PAGINATION_MAX_LIMIT } from "../../../core";

/** Query истории: курсор или `around`, не оба сразу. */
export const GetMessagesQuerySchema = z
  .object({
    cursor: z.string().max(512, "Некорректный курсор").optional(),
    around: z.string().uuid("Некорректный UUID").optional(),
    limit: z.coerce
      .number()
      .int("limit — целое число")
      .min(1, "limit — от 1")
      .max(PAGINATION_MAX_LIMIT, `limit — не больше ${PAGINATION_MAX_LIMIT}`)
      .optional(),
  })
  .refine(q => !(q.cursor && q.around), {
    message: "Укажите либо cursor, либо around",
    path: ["cursor"],
  });
