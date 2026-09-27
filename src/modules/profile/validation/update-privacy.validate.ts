import { z } from "zod";

import { EPrivacyLevel } from "../privacy-settings.entity";

export const UpdatePrivacySchema = z.object({
  showLastOnline: z.nativeEnum(EPrivacyLevel).optional(),
  showPhone: z.nativeEnum(EPrivacyLevel).optional(),
  showAvatar: z.nativeEnum(EPrivacyLevel).optional(),
});
