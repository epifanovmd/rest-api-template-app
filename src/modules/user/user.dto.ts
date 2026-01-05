import { ListResponse } from "../../core";
import { EPermissions } from "../permission/permission.dto";
import { ERole, IRoleDto } from "../role/role.dto";

export interface IUserUpdateRequestDto {
  email?: string;
  phone?: string;
  roleId?: string;
  challenge?: string;
}

export interface IUserPrivilegesRequestDto {
  roleName: ERole;
  permissions: EPermissions[];
}

export interface IUserDto {
  id: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  challenge?: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: IRoleDto;
}

export interface IUserListDto extends ListResponse<IUserDto[]> {}

export interface IUserChangePasswordDto {
  password: string;
}
