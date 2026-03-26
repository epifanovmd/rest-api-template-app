import { z } from "zod";

import { ECallType } from "../call.types";

export const InitiateCallSchema = z.object({
  calleeId: z.string().uuid("Некорректный UUID"),
  chatId: z.string().uuid("Некорректный UUID").optional(),
  type: z.nativeEnum(ECallType).default(ECallType.VOICE),
});
