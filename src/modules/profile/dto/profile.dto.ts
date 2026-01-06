import { IListResponseDto } from "../../../core";
import { IFileDto } from "../../file/file.dto";

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
