import { ICursorPageDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import {
  EFileStatus,
  type IFileDto,
  signedUrlOf,
  type TFileRef,
  type TSignedFiles,
} from "../../file";
import { PollDto } from "../../poll/dto/poll.dto";
import { Message } from "../message.entity";
import {
  EAttachmentStatus,
  EMessageStatus,
  EMessageType,
} from "../message.types";
import { MessageAttachment } from "../message-attachment.entity";

/** Состояние файла → состояние вложения: незавершённая загрузка — «обрабатывается». */
const toAttachmentStatus = (
  status: EFileStatus | undefined,
): EAttachmentStatus => {
  switch (status) {
    case EFileStatus.Failed:
      return EAttachmentStatus.FAILED;
    case EFileStatus.Pending:
    case EFileStatus.Processing:
      return EAttachmentStatus.PROCESSING;
    default:
      return EAttachmentStatus.READY;
  }
};

export class MessageAttachmentDto extends BaseDto {
  id: string;
  fileId: string;
  fileName: string;
  /** Подписанная ссылка для показа; срок ограничен. */
  fileUrl: string;
  /** Подписанная ссылка на скачивание оригинала под исходным именем. */
  downloadUrl: string | null;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  /** Пока `processing`, превью и waveform могут отсутствовать. */
  status: EAttachmentStatus;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[] | null;

  /** `signed` — DTO файла из карты подписей; нет подписи — ссылки пустые. */
  constructor(entity: MessageAttachment, signed: IFileDto | undefined) {
    super(entity);

    const file = entity.file;

    this.id = entity.id;
    this.fileId = entity.fileId;
    this.fileName = file?.name ?? "";
    this.fileUrl = signed?.url ?? "";
    this.downloadUrl = signed?.downloadUrl ?? null;
    this.fileType = file?.type ?? "";
    this.fileSize = file?.size ?? 0;
    this.thumbnailUrl = signed?.thumbnailUrl ?? null;
    this.status = toAttachmentStatus(signed?.status ?? file?.status);
    this.width = file?.width ?? null;
    this.height = file?.height ?? null;
    this.duration = file?.duration ?? null;
    this.waveform = file?.waveform ?? null;
  }

  static fromEntity(entity: MessageAttachment, signed: IFileDto | undefined) {
    return new MessageAttachmentDto(entity, signed);
  }
}

/** Файлы сообщений для подписи пачкой: вложения и аватары авторов, с ответами. */
export const collectMessageFiles = (
  messages: ReadonlyArray<Message | null | undefined>,
): TFileRef[] => {
  const files: TFileRef[] = [];

  for (const message of messages) {
    if (!message) continue;

    for (const attachment of message.attachments ?? []) {
      if (attachment.file) files.push(attachment.file);
    }

    files.push(message.sender?.profile?.avatar);
    if (message.replyTo) files.push(...collectMessageFiles([message.replyTo]));
  }

  return files;
};

export class MessageDto extends BaseDto {
  id: string;
  /** Транзитный клиентский ID для дедупликации оптимистичных сообщений. */
  localId?: string;
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

  /** `files` — карта подписей (`collectMessageFiles` + `FileUrlService.toDtoMap`). */
  constructor(entity: Message, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.chatId = entity.chatId;
    this.senderId = entity.senderId;
    this.type = entity.type;
    this.status = entity.status;
    this.content = entity.content;
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
        avatarUrl: signedUrlOf(entity.sender.profile?.avatar, files),
      };
    }

    this.replyTo = entity.replyTo
      ? MessageDto.fromEntity(entity.replyTo, files)
      : null;

    this.attachments =
      entity.attachments?.map(a =>
        MessageAttachmentDto.fromEntity(a, files.get(a.fileId)),
      ) ?? [];

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

  static fromEntity(entity: Message, files: TSignedFiles) {
    return new MessageDto(entity, files);
  }
}

/**
 * Страница истории сообщений (от новых к старым). `nextCursor` — к более
 * старым, `prevCursor` — к более новым; `null` — в эту сторону конец.
 */
export interface IMessagePageDto extends ICursorPageDto<MessageDto> {
  /** Курсор более новых сообщений; `null` — страница содержит самые новые. */
  prevCursor: string | null;
}
