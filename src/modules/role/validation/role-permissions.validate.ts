import { z } from "zod";

import { EPermissions } from "../../permission/permission.types";

export const SetRolePermissionsSchema = z.object({
  permissions: z
    .array(
      z.enum(EPermissions, {
        message: `Разрешение должно быть одним из: ${Object.values(EPermissions).join(", ")}`,
      }),
    )
    .default([]),
});
