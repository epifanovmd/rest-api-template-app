import { ListResponse } from "../../core";
import { DialogMembersDto } from "../dialog-members/dialog-members.dto";
import { IDialogMessagesDto } from "../dialog-messages/dialog-messages.dto";
import { IUserDto } from "../user/user.dto";

export interface DialogDto {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: IUserDto;
  members: DialogMembersDto[];
  lastMessage: IDialogMessagesDto[] | null;
  unreadMessagesCount: number;
}

export interface IDialogListDto extends ListResponse<DialogDto[]> {}

export interface DialogCreateRequest {
  recipientId: string[];
}

export interface DialogFindRequest {
  recipientId: string[];
}
