import { BaseDto } from "../../../core/dto/BaseDto";
import { ChatInvite } from "../chat-invite.entity";

export class ChatInviteDto extends BaseDto {
  id: string;
  chatId: string;
  code: string;
  createdById: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: Date;

  constructor(entity: ChatInvite) {
    super(entity);

    this.id = entity.id;
    this.chatId = entity.chatId;
    this.code = entity.code;
    this.createdById = entity.createdById;
    this.expiresAt = entity.expiresAt;
    this.maxUses = entity.maxUses;
    this.useCount = entity.useCount;
    this.isActive = entity.isActive;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: ChatInvite) {
    return new ChatInviteDto(entity);
  }
}
