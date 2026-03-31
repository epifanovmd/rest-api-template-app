import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { EMessageType } from "../../message/message.types";
import { PublicProfileDto } from "../../profile/dto";
import { Chat } from "../chat.entity";
import { EChatMemberRole, EChatType } from "../chat.types";
import { ChatMember } from "../chat-member.entity";

export class ChatMemberDto extends BaseDto {
  id: string;
  userId: string;
  role: EChatMemberRole;
  joinedAt: Date;
  mutedUntil: Date | null;
  lastReadMessageId: string | null;
  isPinnedChat: boolean;
  pinnedChatAt: Date | null;
  folderId: string | null;
  profile?: PublicProfileDto;

  constructor(entity: ChatMember) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.role = entity.role;
    this.joinedAt = entity.joinedAt;
    this.mutedUntil = entity.mutedUntil;
    this.lastReadMessageId = entity.lastReadMessageId;
    this.isPinnedChat = entity.isPinnedChat;
    this.pinnedChatAt = entity.pinnedChatAt;
    this.folderId = entity.folderId;

    if (entity.user?.profile) {
      this.profile = PublicProfileDto.fromEntity(entity.user.profile);
    }
  }

  static fromEntity(entity: ChatMember) {
    return new ChatMemberDto(entity);
  }
}

/** Публичные данные собеседника в direct-чате (без приватных настроек членства). */
export class ChatPeerDto {
  userId: string;
  role: EChatMemberRole;
  profile?: PublicProfileDto;

  constructor(entity: ChatMember) {
    this.userId = entity.userId;
    this.role = entity.role;

    if (entity.user?.profile) {
      this.profile = PublicProfileDto.fromEntity(entity.user.profile);
    }
  }

  static fromEntity(entity: ChatMember) {
    return new ChatPeerDto(entity);
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

export class ChatDto extends BaseDto {
  id: string;
  type: EChatType;
  name: string | null;
  description: string | null;
  username: string | null;
  isPublic: boolean;
  avatarUrl: string | null;
  createdById: string | null;
  slowModeSeconds: number;
  lastMessageAt: Date | null;
  lastMessage: ChatLastMessageDto | null;
  createdAt: Date;
  updatedAt: Date;
  members: ChatMemberDto[];
  /** Членство текущего пользователя в чате */
  me: ChatMemberDto | null;
  /** Собеседник в direct-чате (null для групп/каналов) */
  peer: ChatPeerDto | null;

  constructor(entity: Chat, currentUserId?: string) {
    super(entity);

    this.id = entity.id;
    this.type = entity.type;
    this.name = entity.name;
    this.description = entity.description;
    this.username = entity.username;
    this.isPublic = entity.isPublic;
    this.avatarUrl = entity.avatar?.url ?? null;
    this.createdById = entity.createdById;
    this.slowModeSeconds = entity.slowModeSeconds;
    this.lastMessageAt = entity.lastMessageAt;
    this.lastMessage = ChatLastMessageDto.fromEntity(entity);
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.members = entity.members?.map(ChatMemberDto.fromEntity) ?? [];

    if (currentUserId) {
      this.me = this.members.find(m => m.userId === currentUserId) ?? null;

      const peerMember = entity.type === EChatType.DIRECT
        ? entity.members?.find(m => m.userId !== currentUserId)
        : undefined;

      this.peer = peerMember ? ChatPeerDto.fromEntity(peerMember) : null;
    } else {
      this.me = null;
      this.peer = null;
    }
  }

  static fromEntity(entity: Chat, currentUserId?: string) {
    return new ChatDto(entity, currentUserId);
  }
}

export interface IChatListDto extends IListResponseDto<ChatDto[]> {}
