import { inject } from "inversify";
import { DataSource } from "typeorm";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { ChatError } from "./chat.errors";
import { ChatRepository } from "./chat.repository";
import { canModerateMember } from "./chat.service";
import { EChatMemberRole } from "./chat.types";
import { ChatBanRepository } from "./chat-ban.repository";
import { ChatMember } from "./chat-member.entity";
import { ChatMemberRepository } from "./chat-member.repository";
import { IBannedMemberDto } from "./dto/chat-moderation-request.dto";
import {
  ChatMemberBannedEvent,
  ChatMemberLeftEvent,
  ChatMemberUnbannedEvent,
  ChatSlowModeEvent,
} from "./events";

@Injectable()
export class ChatModerationService {
  constructor(
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatBanRepository) private _banRepo: ChatBanRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
  ) {}

  async setSlowMode(chatId: string, userId: string, seconds: number) {
    await this.assertAdmin(
      chatId,
      userId,
      "Только администратор может изменять режим медленной отправки",
    );

    await this._chatRepo.update({ id: chatId }, { slowModeSeconds: seconds });

    this._eventBus.emit(new ChatSlowModeEvent(chatId, seconds, userId));

    return { chatId, slowModeSeconds: seconds };
  }

  /**
   * Бан: запись в `chat_bans` и удаление членства в одной транзакции.
   * `duration` (сек.) не задан или 0 — бессрочно.
   */
  async banMember(
    chatId: string,
    userId: string,
    targetUserId: string,
    duration?: number,
    reason?: string,
  ): Promise<void> {
    const actor = await this.assertAdmin(
      chatId,
      userId,
      "Только администратор может блокировать участников",
    );

    if (userId === targetUserId) {
      throw ChatError.SELF_BAN();
    }

    const target = await this._memberRepo.findMembership(chatId, targetUserId);

    if (!target) {
      throw ChatError.MEMBER_NOT_FOUND(
        undefined,
        "Участник не найден в этом чате",
      );
    }

    if (!canModerateMember(actor.role, target.role)) {
      throw ChatError.CANNOT_MODERATE(
        undefined,
        "Недостаточно прав для блокировки этого участника",
      );
    }

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);
    const until = duration ? new Date(Date.now() + duration * 1000) : null;

    await this._dataSource.transaction(async manager => {
      await this._banRepo.upsertBan(
        {
          chatId,
          userId: targetUserId,
          bannedById: userId,
          reason: reason ?? null,
          until,
        },
        manager,
      );
      await manager.getRepository(ChatMember).delete({ id: target.id });
    });

    this._eventBus.emit(
      new ChatMemberLeftEvent(chatId, targetUserId, memberUserIds),
    );
    this._eventBus.emit(
      new ChatMemberBannedEvent(chatId, targetUserId, userId, duration, reason),
    );
  }

  /** Снятие бана. В чат пользователь не возвращается — вступает заново. */
  async unbanMember(
    chatId: string,
    userId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertAdmin(
      chatId,
      userId,
      "Только администратор может разблокировать участников",
    );

    const removed = await this._banRepo.removeBan(chatId, targetUserId);

    if (!removed) {
      throw ChatError.NOT_BANNED();
    }

    this._eventBus.emit(
      new ChatMemberUnbannedEvent(chatId, targetUserId, userId),
    );
  }

  async getBannedMembers(
    chatId: string,
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<IBannedMemberDto>> {
    await this.assertAdmin(
      chatId,
      userId,
      "Только администратор может просматривать заблокированных",
    );

    const page = normalizePagination(offset, limit);
    const [bans, total] = await this._banRepo.findActiveBans(
      chatId,
      page.offset,
      page.limit,
    );

    return toPage(
      bans.map(ban => ({
        chatId: ban.chatId,
        userId: ban.userId,
        bannedBy: ban.bannedById,
        reason: ban.reason,
        bannedAt: ban.createdAt,
        expiresAt: ban.until,
      })),
      total,
      page,
    );
  }

  private async assertAdmin(chatId: string, userId: string, message: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw ChatError.NOT_MEMBER();
    }

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw ChatError.ADMIN_REQUIRED(undefined, message);
    }

    return membership;
  }
}
