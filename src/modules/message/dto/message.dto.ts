import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { Message } from "../message.entity";
import { EMessageType } from "../message.types";
import { MessageAttachment } from "../message-attachment.entity";

export class MessageAttachmentDto extends BaseDto {
  id: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;

  constructor(entity: MessageAttachment) {
    super(entity);

    this.id = entity.id;
    this.fileId = entity.fileId;
    this.fileName = entity.file?.name ?? "";
    this.fileUrl = entity.file?.url ?? "";
    this.fileType = entity.file?.type ?? "";
    this.fileSize = entity.file?.size ?? 0;
  }

  static fromEntity(entity: MessageAttachment) {
    return new MessageAttachmentDto(entity);
  }
}

export class MessageDto extends BaseDto {
  id: string;
  chatId: string;
  senderId: string;
  type: EMessageType;
  content: string | null;
  replyToId: string | null;
  forwardedFromId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  sender?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  replyTo?: MessageDto | null;
  attachments: MessageAttachmentDto[];

  constructor(entity: Message) {
    super(entity);

    this.id = entity.id;
    this.chatId = entity.chatId;
    this.senderId = entity.senderId;
    this.type = entity.type;
    this.content = entity.isDeleted ? null : entity.content;
    this.replyToId = entity.replyToId;
    this.forwardedFromId = entity.forwardedFromId;
    this.isEdited = entity.isEdited;
    this.isDeleted = entity.isDeleted;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    if (entity.sender) {
      this.sender = {
        id: entity.sender.id,
        firstName: entity.sender.profile?.firstName,
        lastName: entity.sender.profile?.lastName,
        avatarUrl: entity.sender.profile?.avatar?.url,
      };
    }

    this.replyTo = entity.replyTo
      ? MessageDto.fromEntity(entity.replyTo)
      : null;

    this.attachments =
      entity.attachments?.map(MessageAttachmentDto.fromEntity) ?? [];
  }

  static fromEntity(entity: Message) {
    return new MessageDto(entity);
  }
}

export interface IMessageListDto {
  data: MessageDto[];
  hasMore: boolean;
}

export interface IMessageListResponseDto
  extends IListResponseDto<MessageDto[]> {}
