import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { IFileDto } from "../../file/file.dto";
import { PublicUserDto } from "../../user/dto";
import { DialogMessages } from "../dialog-messages.entity";

export class DialogMessagesDto extends BaseDto {
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
  user: PublicUserDto;
  images?: IFileDto[];
  videos?: IFileDto[];
  audios?: IFileDto[];
  reply?: DialogMessagesDto;

  constructor(entity: DialogMessages) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.dialogId = entity.dialogId;
    this.text = entity.text;
    this.system = entity.system;
    this.sent = entity.sent;
    this.received = entity.received;
    this.replyId = entity.replyId;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.user = entity.user && PublicUserDto.fromEntity(entity.user);
    this.reply = entity.reply && DialogMessagesDto.fromEntity(entity.reply);
  }

  static fromEntity(entity: DialogMessages) {
    return new DialogMessagesDto(entity);
  }
}

export interface IDialogListMessagesDto
  extends IListResponseDto<DialogMessagesDto[]> {}
