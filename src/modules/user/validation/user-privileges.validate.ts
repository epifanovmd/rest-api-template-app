import { z } from "zod";

import { EPermissions } from "../../permission/permission.types";
import { ERole } from "../../role/role.types";

export const SetPrivilegesSchema = z.object({
  roleName: z.nativeEnum(ERole, {
    message: `Роль должна быть одной из: ${Object.values(ERole).join(", ")}`,
  }),
  permissions: z.array(
    z.nativeEnum(EPermissions, {
      message: `Разрешение должно быть одним из: ${Object.values(EPermissions).join(", ")}`,
    }),
  ),
});
