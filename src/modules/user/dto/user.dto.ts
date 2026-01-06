import { IListResponseDto } from "../../../core";
import { IProfileDto } from "../../profile/dto";
import { IRoleDto } from "../../role/role.dto";

export interface IUserDto {
  id: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  challenge?: string | null;
  profile?: IProfileDto;
  role?: IRoleDto;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserListDto extends IListResponseDto<IUserDto[]> {}
