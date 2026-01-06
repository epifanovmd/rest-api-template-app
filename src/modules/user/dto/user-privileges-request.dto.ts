import { EPermissions } from "../../permission/permission.types";
import { ERole } from "../../role/role.types";

export interface IUserPrivilegesRequestDto {
  roleName: ERole;
  permissions: EPermissions[];
}
