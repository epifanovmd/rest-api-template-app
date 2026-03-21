import { z } from "zod";

import { EPermissions } from "../../permission/permission.types";
import { ERole } from "../../role/role.types";

export const SetPrivilegesSchema = z.object({
  roles: z
    .array(
      z.enum(ERole, {
        message: `Роль должна быть одной из: ${Object.values(ERole).join(
          ", ",
        )}`,
      }),
    )
    .min(1, "Необходимо указать хотя бы одну роль"),
  permissions: z
    .array(
      z.enum(EPermissions, {
        message: `Разрешение должно быть одним из: ${Object.values(
          EPermissions,
        ).join(", ")}`,
      }),
    )
    .default([]),
});
