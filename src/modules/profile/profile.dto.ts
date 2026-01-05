import { IListResponseDto } from "../../core";
import { IFileDto } from "../file/file.dto";

export interface IProfileUpdateRequestDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  gender?: string;
  status?: string;
}

export interface IProfileDto {
  id: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date | null;
  gender?: string;
  status?: string;
  lastOnline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  avatar: IFileDto | null;
}

export interface IProfileListDto extends IListResponseDto<IProfileDto[]> {}
