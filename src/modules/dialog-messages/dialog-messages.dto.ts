import { IListResponseDto } from "../../core";
import { IFileDto } from "../file/file.dto";
import { IUserDto } from "../user/user.dto";

export interface IDialogMessagesDto {
  id: string;
  userId: string;
  dialogId: string;
  text: string;
  system?: boolean;
  sent?: boolean;
  received?: boolean;
  replyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: IUserDto;
  images?: IFileDto[];
  videos?: IFileDto[];
  audios?: IFileDto[];
  reply?: IDialogMessagesDto;
}

export interface IDialogListMessagesDto
  extends IListResponseDto<IDialogMessagesDto[]> {}

export interface IMessagesRequestDto {
  dialogId: string;
  text: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
}

export interface IMessagesUpdateRequestDto {
  text?: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
  deleteFileIds?: string[];
}
