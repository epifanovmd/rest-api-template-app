import { EPermissions } from "../modules/permission";
import { ERole } from "../modules/role";

declare module "tsoa" {
  type RoleStrings = `role:${ERole}`;
  type PermissionStrings = `permission:${EPermissions}`;
  type SecurityScopes = (RoleStrings | PermissionStrings)[];

  export function Security(name: "jwt", scopes?: SecurityScopes): Function;
}
