import { EPermissions } from "../../permission/permission.types";
import { ERole } from "../../role/role.types";

export interface IUserPrivilegesRequestDto {
  /** Roles to assign to the user (replaces current roles). */
  roles: ERole[];
  /**
   * Direct permissions granted to this user on top of role permissions.
   * Replaces current direct permissions.
   */
  permissions: EPermissions[];
}
