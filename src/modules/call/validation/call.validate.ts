import { z } from "zod";

import { ECallType } from "../call.types";

export const InitiateCallSchema = z.object({
  calleeId: z.string().uuid("Некорректный UUID"),
  type: z.nativeEnum(ECallType).default(ECallType.VOICE),
});
