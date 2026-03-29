import { TPermission } from "../../permission/permission.types";
import { TRole } from "../role.types";

export interface IRolePermissionsRequestDto {
  permissions: TPermission[];
}

export interface ICreateRoleRequestDto {
  name: TRole;
}
