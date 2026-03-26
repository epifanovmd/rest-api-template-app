import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
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
  isPinnedChat: boolean;
  isArchived: boolean;
  folderId: string | null;
  profile?: PublicProfileDto;

  constructor(entity: ChatMember) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.role = entity.role;
    this.joinedAt = entity.joinedAt;
    this.mutedUntil = entity.mutedUntil;
    this.isPinnedChat = entity.isPinnedChat;
    this.isArchived = entity.isArchived;
    this.folderId = entity.folderId;

    if (entity.user?.profile) {
      this.profile = PublicProfileDto.fromEntity(entity.user.profile);
    }
  }

  static fromEntity(entity: ChatMember) {
    return new ChatMemberDto(entity);
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
  createdById: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  members: ChatMemberDto[];

  constructor(entity: Chat) {
    super(entity);

    this.id = entity.id;
    this.type = entity.type;
    this.name = entity.name;
    this.description = entity.description;
    this.username = entity.username;
    this.isPublic = entity.isPublic;
    this.avatarUrl = entity.avatar?.url ?? null;
    this.createdById = entity.createdById;
    this.lastMessageAt = entity.lastMessageAt;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.members = entity.members?.map(ChatMemberDto.fromEntity) ?? [];
  }

  static fromEntity(entity: Chat) {
    return new ChatDto(entity);
  }
}

export interface IChatListDto extends IListResponseDto<ChatDto[]> {}
