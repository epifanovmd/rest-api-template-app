import { BaseDto } from "../../../core/dto/BaseDto";
import { signedUrlOf, type TFileRef, type TSignedFiles } from "../../file";
import { EMessageType } from "../../message/message.types";
import { collectProfileFiles, PublicProfileDto } from "../../profile/dto";
import { Chat } from "../chat.entity";
import { EChatMemberRole, EChatType } from "../chat.types";
import { ChatMember } from "../chat-member.entity";

/** Аватары участников — для подписи пачкой перед сборкой DTO участников. */
export const collectChatMemberFiles = (
  members: ReadonlyArray<ChatMember | null | undefined>,
): TFileRef[] =>
  collectProfileFiles(members.map(member => member?.user?.profile));

/**
 * Файлы чатов для подписи пачкой: аватар чата и аватары его участников
 * (`entity.members` и переданные отдельно — превью, `me`).
 */
export const collectChatFiles = (
  chats: ReadonlyArray<Chat>,
  members: ReadonlyArray<ChatMember | null | undefined> = [],
): TFileRef[] => [
  ...chats.flatMap(chat => [
    chat.avatar,
    ...collectChatMemberFiles(chat.members ?? []),
  ]),
  ...collectChatMemberFiles(members),
];

/** Публичные данные участника: видны всем участникам чата. */
export class ChatMemberPublicDto extends BaseDto {
  id: string;
  userId: string;
  role: EChatMemberRole;
  joinedAt: Date;
  profile?: PublicProfileDto;

  constructor(entity: ChatMember, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.role = entity.role;
    this.joinedAt = entity.joinedAt;

    if (entity.user?.profile) {
      this.profile = PublicProfileDto.fromEntity(entity.user.profile, files);
    }
  }

  static fromEntity(entity: ChatMember, files: TSignedFiles) {
    return new ChatMemberPublicDto(entity, files);
  }
}

/** Членство текущего пользователя: публичные поля + личные настройки чата. */
export class ChatMemberDto extends ChatMemberPublicDto {
  mutedUntil: Date | null;
  lastReadMessageId: string | null;
  isPinnedChat: boolean;
  pinnedChatAt: Date | null;
  folderId: string | null;

  constructor(entity: ChatMember, files: TSignedFiles) {
    super(entity, files);

    this.mutedUntil = entity.mutedUntil;
    this.lastReadMessageId = entity.lastReadMessageId;
    this.isPinnedChat = entity.isPinnedChat;
    this.pinnedChatAt = entity.pinnedChatAt;
    this.folderId = entity.folderId;
  }

  static fromEntity(entity: ChatMember, files: TSignedFiles) {
    return new ChatMemberDto(entity, files);
  }
}

/** Публичные данные собеседника в direct-чате (без приватных настроек членства). */
export class ChatPeerDto {
  userId: string;
  role: EChatMemberRole;
  profile?: PublicProfileDto;

  constructor(entity: ChatMember, files: TSignedFiles) {
    this.userId = entity.userId;
    this.role = entity.role;

    if (entity.user?.profile) {
      this.profile = PublicProfileDto.fromEntity(entity.user.profile, files);
    }
  }

  static fromEntity(entity: ChatMember, files: TSignedFiles) {
    return new ChatPeerDto(entity, files);
  }
}

export class ChatLastMessageDto {
  id: string;
  content: string | null;
  type: EMessageType;
  senderId: string | null;
  senderName: string | null;
  createdAt: Date;

  constructor(entity: Chat) {
    this.id = entity.lastMessageId!;
    this.content = entity.lastMessageContent;
    this.type = entity.lastMessageType!;
    this.senderId = entity.lastMessageSenderId;

    const sender = entity.lastMessageSender;

    this.senderName = sender?.profile
      ? [sender.profile.firstName, sender.profile.lastName]
          .filter(Boolean)
          .join(" ") || null
      : null;
    this.createdAt = entity.lastMessageAt!;
  }

  static fromEntity(entity: Chat): ChatLastMessageDto | null {
    if (!entity.lastMessageId) return null;

    return new ChatLastMessageDto(entity);
  }
}

/**
 * Дополнительные данные для сборки ChatDto (превью участников, счётчик).
 * Их файлы тоже должны быть в карте подписей (`collectChatFiles(chats, members)`).
 */
export interface IChatDtoExtra {
  /** Участники для `members`; по умолчанию — `entity.members`. */
  members?: ChatMember[];
  /** Общее число участников; по умолчанию — длина `members`. */
  membersCount?: number;
  /** Членство текущего пользователя; по умолчанию ищется в `entity.members`. */
  me?: ChatMember | null;
}

export class ChatDto extends BaseDto {
  id: string;
  type: EChatType;
  name: string | null;
  description: string | null;
  username: string | null;
  isPublic: boolean;
  /** Подписанная ссылка на аватар; срок ограничен. */
  avatarUrl: string | null;
  createdById: string | null;
  slowModeSeconds: number;
  lastMessageAt: Date | null;
  lastMessage: ChatLastMessageDto | null;
  createdAt: Date;
  updatedAt: Date;
  /** Участники (для групп и каналов — первые N) без приватных настроек. */
  members: ChatMemberPublicDto[];
  /** Общее число участников чата. */
  membersCount: number;
  /** Членство текущего пользователя в чате (с личными настройками). */
  me: ChatMemberDto | null;
  /** Собеседник в direct-чате (null для групп/каналов) */
  peer: ChatPeerDto | null;

  /** `files` — карта подписей (`collectChatFiles` + `FileUrlService.toDtoMap`). */
  constructor(
    entity: Chat,
    files: TSignedFiles,
    currentUserId?: string,
    extra: IChatDtoExtra = {},
  ) {
    super(entity);

    this.id = entity.id;
    this.type = entity.type;
    this.name = entity.name;
    this.description = entity.description;
    this.username = entity.username;
    this.isPublic = entity.isPublic;
    this.avatarUrl = signedUrlOf(entity.avatar, files);
    this.createdById = entity.createdById;
    this.slowModeSeconds = entity.slowModeSeconds;
    this.lastMessageAt = entity.lastMessageAt;
    this.lastMessage = ChatLastMessageDto.fromEntity(entity);
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    const members = extra.members ?? entity.members ?? [];

    this.members = members.map(m => ChatMemberPublicDto.fromEntity(m, files));
    this.membersCount = extra.membersCount ?? members.length;

    if (currentUserId) {
      const me =
        extra.me !== undefined
          ? extra.me
          : (entity.members?.find(m => m.userId === currentUserId) ??
            members.find(m => m.userId === currentUserId));

      this.me = me ? ChatMemberDto.fromEntity(me, files) : null;

      const peerMember =
        entity.type === EChatType.DIRECT
          ? members.find(m => m.userId !== currentUserId)
          : undefined;

      this.peer = peerMember ? ChatPeerDto.fromEntity(peerMember, files) : null;
    } else {
      this.me = null;
      this.peer = null;
    }
  }

  static fromEntity(
    entity: Chat,
    files: TSignedFiles,
    currentUserId?: string,
    extra?: IChatDtoExtra,
  ) {
    return new ChatDto(entity, files, currentUserId, extra);
  }
}
