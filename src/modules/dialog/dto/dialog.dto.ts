import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import {
  DialogLastMessagesDto,
  DialogMessagesDto,
} from "../../dialog-messages/dto";
import { PublicUserDto } from "../../user/dto";
import { Dialog } from "../dialog.entity";

export class DialogDetailDto extends BaseDto {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: PublicUserDto;
  participants: PublicUserDto[];
  lastMessage: DialogLastMessagesDto | null;
  unreadMessagesCount: number;

  constructor(entity: Dialog, unreadMessagesCount = 0) {
    super(entity);

    this.id = entity.id;
    this.ownerId = entity.ownerId;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.owner = PublicUserDto.fromEntity(entity.owner);
    this.participants = entity.members.map(member =>
      PublicUserDto.fromEntity(member.user),
    );
    this.lastMessage = entity.lastMessage
      ? DialogLastMessagesDto.fromEntity(entity.lastMessage)
      : null;
    this.unreadMessagesCount = unreadMessagesCount;
  }

  static fromEntity(entity: Dialog, unreadMessagesCount = 0) {
    return new DialogDetailDto(entity, unreadMessagesCount);
  }
}

export class DialogDto extends BaseDto {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  participants: PublicUserDto[];
  lastMessage: DialogLastMessagesDto | null;
  unreadMessagesCount: number;

  constructor(entity: Dialog, unreadMessagesCount = 0) {
    super(entity);

    this.id = entity.id;
    this.ownerId = entity.ownerId;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.participants = entity.members.map(member =>
      PublicUserDto.fromEntity(member.user),
    );
    this.lastMessage = entity.lastMessage
      ? DialogLastMessagesDto.fromEntity(entity.lastMessage)
      : null;
    this.unreadMessagesCount = unreadMessagesCount;
  }

  static fromEntity(entity: Dialog, unreadMessagesCount = 0) {
    return new DialogDto(entity, unreadMessagesCount);
  }
}

export interface IDialogListDto extends IListResponseDto<DialogDto[]> {}
