import { IListResponseDto } from "../../../core";
import { IRoleDto } from "../../role/role.dto";

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

export interface IUserListDto extends IListResponseDto<IUserDto[]> {}
