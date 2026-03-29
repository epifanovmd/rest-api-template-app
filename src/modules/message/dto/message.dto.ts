import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { PollDto } from "../../poll/dto/poll.dto";
import { Message } from "../message.entity";
import { EMessageStatus, EMessageType } from "../message.types";
import { MessageAttachment } from "../message-attachment.entity";

export class MessageAttachmentDto extends BaseDto {
  id: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;

  constructor(entity: MessageAttachment) {
    super(entity);

    this.id = entity.id;
    this.fileId = entity.fileId;
    this.fileName = entity.file?.name ?? "";
    this.fileUrl = entity.file?.url ?? "";
    this.fileType = entity.file?.type ?? "";
    this.fileSize = entity.file?.size ?? 0;
    this.thumbnailUrl = entity.file?.thumbnailUrl ?? null;
    this.width = entity.file?.width ?? null;
    this.height = entity.file?.height ?? null;
  }

  static fromEntity(entity: MessageAttachment) {
    return new MessageAttachmentDto(entity);
  }
}

export class MessageDto extends BaseDto {
  id: string;
  chatId: string;
  senderId: string | null;
  type: EMessageType;
  status: EMessageStatus;
  content: string | null;
  replyToId: string | null;
  forwardedFromId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  pinnedAt: Date | null;
  pinnedById: string | null;
  keyboard: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  sender?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };
  replyTo?: MessageDto | null;
  attachments: MessageAttachmentDto[];
  reactions: { emoji: string; count: number; userIds: string[] }[];
  mentions: { userId: string | null; isAll: boolean }[];
  poll?: PollDto | null;

  constructor(entity: Message) {
    super(entity);

    this.id = entity.id;
    this.chatId = entity.chatId;
    this.senderId = entity.senderId;
    this.type = entity.type;
    this.status = entity.status;
    this.content = entity.isDeleted ? null : entity.content;
    this.replyToId = entity.replyToId;
    this.forwardedFromId = entity.forwardedFromId;
    this.isEdited = entity.isEdited;
    this.isDeleted = entity.isDeleted;
    this.isPinned = entity.isPinned;
    this.pinnedAt = entity.pinnedAt;
    this.pinnedById = entity.pinnedById;
    this.keyboard = entity.keyboard;
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

    // Build reactions summary
    if (entity.reactions && entity.reactions.length > 0) {
      const map = new Map<string, string[]>();

      for (const r of entity.reactions) {
        const list = map.get(r.emoji) ?? [];

        list.push(r.userId);
        map.set(r.emoji, list);
      }

      this.reactions = Array.from(map.entries()).map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
      }));
    } else {
      this.reactions = [];
    }

    this.mentions =
      entity.mentions?.map(m => ({
        userId: m.userId,
        isAll: m.isAll,
      })) ?? [];
  }

  static fromEntity(entity: Message) {
    return new MessageDto(entity);
  }
}

export interface IMessageListDto {
  data: MessageDto[];
  hasMore: boolean;
}

export interface IMessageSearchDto {
  data: MessageDto[];
  totalCount: number;
}

export interface IMessageListResponseDto
  extends IListResponseDto<MessageDto[]> {}
