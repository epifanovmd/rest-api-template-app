import { ListResponse } from "../../core";
import { IPermissionDto } from "../permission/permission.dto";

export enum ERole {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest",
}

export interface IRoleDto {
  id: string;
  name: ERole;
  createdAt: Date;
  updatedAt: Date;
  permissions: IPermissionDto[];
}

export interface IRoleListDto extends ListResponse<IRoleDto[]> {}
