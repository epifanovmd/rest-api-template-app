import { BaseDto } from "../../../core/dto/BaseDto";
import { signedUrlOf, type TSignedFiles } from "../../file";
import { Message } from "../message.entity";
import { MessageAttachmentDto } from "./message.dto";

export class MediaItemDto extends BaseDto {
  id: string;
  messageId: string;
  chatId: string;
  senderId: string | null;
  attachments: MessageAttachmentDto[];
  createdAt: Date;
  sender?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };

  constructor(entity: Message, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.messageId = entity.id;
    this.chatId = entity.chatId;
    this.senderId = entity.senderId;
    this.createdAt = entity.createdAt;

    this.attachments =
      entity.attachments?.map(a =>
        MessageAttachmentDto.fromEntity(a, files.get(a.fileId)),
      ) ?? [];

    if (entity.sender) {
      this.sender = {
        id: entity.sender.id,
        firstName: entity.sender.profile?.firstName,
        lastName: entity.sender.profile?.lastName,
        avatarUrl: signedUrlOf(entity.sender.profile?.avatar, files),
      };
    }
  }

  static fromEntity(entity: Message, files: TSignedFiles) {
    return new MediaItemDto(entity, files);
  }
}

export interface IMediaStatsDto {
  images: number;
  videos: number;
  audio: number;
  documents: number;
  total: number;
}
