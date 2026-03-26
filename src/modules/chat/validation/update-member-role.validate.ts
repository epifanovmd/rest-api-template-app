import { z } from "zod";

import { EChatMemberRole } from "../chat.types";

export const UpdateMemberRoleSchema = z.object({
  role: z.nativeEnum(EChatMemberRole),
});
