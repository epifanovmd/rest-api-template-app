import { IListResponseDto } from "../../core";

export enum EPermissions {
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
}

export interface IPermissionDto {
  id: string;
  name: EPermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPermissionListDto
  extends IListResponseDto<IPermissionDto[]> {}
