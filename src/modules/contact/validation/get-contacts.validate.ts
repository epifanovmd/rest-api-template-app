import { z } from "zod";

import { PAGINATION_MAX_LIMIT } from "../../../core";
import { EContactStatus } from "../contact.types";

/** Query списка контактов: фильтр по статусу и страница. */
export const GetContactsQuerySchema = z.object({
  status: z
    .enum(EContactStatus, { message: "Недопустимый статус контакта" })
    .optional(),
  offset: z.coerce
    .number()
    .int("offset — целое число")
    .min(0, "offset — от 0")
    .optional(),
  limit: z.coerce
    .number()
    .int("limit — целое число")
    .min(1, "limit — от 1")
    .max(PAGINATION_MAX_LIMIT, `limit — не больше ${PAGINATION_MAX_LIMIT}`)
    .optional(),
});
