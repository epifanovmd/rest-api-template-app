import { TPermission } from "../../permission";
import { TRole } from "../role.types";

/** Набор прав роли заменён — у всех её пользователей изменились эффективные права. */
export class RolePermissionsChangedEvent {
  constructor(
    public readonly roleId: string,
    public readonly roleName: TRole,
    public readonly permissions: TPermission[],
  ) {}
}
