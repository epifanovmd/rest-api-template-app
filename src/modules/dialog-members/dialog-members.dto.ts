import { IUserDto } from "../user/user.dto";

export interface DialogMembersDto {
  id: string;
  userId: string;
  dialogId: string;
  createdAt: Date;
  updatedAt: Date;
  user: IUserDto;
}

export interface DialogMembersAddRequest {
  dialogId: string;
  members: string[];
}
