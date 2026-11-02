import { PermissionName } from "../../permission";
import { RoleName } from "../role.types";

export interface IRolePermissionsRequestDto {
  permissions: PermissionName[];
}

export interface ICreateRoleRequestDto {
  name: RoleName;
}
