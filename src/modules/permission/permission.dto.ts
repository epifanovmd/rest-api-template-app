import { IListResponseDto } from "../../core";
import { EPermissions } from "./permission.types";

export interface IPermissionDto {
  id: string;
  name: EPermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPermissionListDto
  extends IListResponseDto<IPermissionDto[]> {}
