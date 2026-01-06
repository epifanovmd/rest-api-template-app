import { IListResponseDto } from "../../core";
import { IPermissionDto } from "../permission/permission.dto";
import { ERole } from "./role.types";

export interface IRoleDto {
  id: string;
  name: ERole;
  createdAt: Date;
  updatedAt: Date;
  permissions: IPermissionDto[];
}

export interface IRoleListDto extends IListResponseDto<IRoleDto[]> {}
