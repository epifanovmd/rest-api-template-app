import { EntityManager, In, IsNull, Not } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { User } from "../user/user.entity";
import { EChatMemberRole, EChatType } from "./chat.types";
import { ChatMember } from "./chat-member.entity";

/** Сколько участников группы/канала отдаётся в превью списка чатов. */
export const CHAT_MEMBERS_PREVIEW_LIMIT = 5;

@InjectableRepository(ChatMember)
export class ChatMemberRepository extends BaseRepository<ChatMember> {
  async findMembership(chatId: string, userId: string) {
    return this.findOne({
      where: { chatId, userId },
    });
  }

  /** Членство с профилем пользователя — для поля `me` в ChatDto. */
  async findMembershipWithProfile(chatId: string, userId: string) {
    return this.findOne({
      where: { chatId, userId },
      relations: { user: { profile: { avatar: true } } },
    });
  }

  async findMembershipsByChat(
    chatId: string,
    userIds: string[],
  ): Promise<ChatMember[]> {
    if (userIds.length === 0) return [];

    return this.find({
      where: { chatId, userId: In(userIds) },
    });
  }

  /** Членства пользователей чата с профилями — для ответа на добавление. */
  async findMembershipsWithProfile(
    chatId: string,
    userIds: string[],
  ): Promise<ChatMember[]> {
    if (userIds.length === 0) return [];

    return this.find({
      where: { chatId, userId: In(userIds) },
      relations: { user: { profile: { avatar: true } } },
      order: { joinedAt: "ASC" },
    });
  }

  /** Постраничный список участников чата (старейшие первыми). */
  async findChatMembersPaged(chatId: string, offset?: number, limit?: number) {
    return this.findAndCount({
      where: { chatId },
      relations: { user: { profile: { avatar: true } } },
      order: { joinedAt: "ASC" },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Первые N участников каждого чата (по дате вступления) с профилями.
   * Один запрос с оконной функцией вместо загрузки всех участников.
   */
  async findPreviewMembers(
    chatIds: string[],
    limit = CHAT_MEMBERS_PREVIEW_LIMIT,
  ): Promise<ChatMember[]> {
    if (chatIds.length === 0) return [];

    const rows = await this.query(
      `SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY joined_at ASC, id ASC) AS rn
         FROM chat_members
         WHERE chat_id = ANY($1)
       ) t
       WHERE rn <= $2`,
      [chatIds, limit],
    );
    const ids = (rows as Array<{ id: string }>).map(r => r.id);

    if (ids.length === 0) return [];

    return this.find({
      where: { id: In(ids) },
      relations: { user: { profile: { avatar: true } } },
      order: { joinedAt: "ASC" },
    });
  }

  /** Количество участников по каждому чату. */
  async countByChatIds(chatIds: string[]): Promise<Record<string, number>> {
    if (chatIds.length === 0) return {};

    const rows = await this.createQueryBuilder("m")
      .select("m.chatId", "chatId")
      .addSelect("COUNT(*)", "count")
      .where("m.chatId IN (:...chatIds)", { chatIds })
      .groupBy("m.chatId")
      .getRawMany<{ chatId: string; count: string }>();

    const result: Record<string, number> = {};

    for (const row of rows) {
      result[row.chatId] = Number(row.count);
    }

    return result;
  }

  async countMembers(chatId: string) {
    return this.count({ where: { chatId } });
  }

  async getMemberUserIds(chatId: string): Promise<string[]> {
    const members = await this.find({
      where: { chatId },
      select: { userId: true },
    });

    return members.map(m => m.userId);
  }

  /** Из переданных chatIds оставляет только те, где пользователь состоит. */
  async filterMemberChatIds(
    userId: string,
    chatIds: string[],
  ): Promise<string[]> {
    if (chatIds.length === 0) return [];

    const members = await this.find({
      where: { userId, chatId: In(chatIds) },
      select: { chatId: true },
    });

    return members.map(m => m.chatId);
  }

  /**
   * Вставка членств с `ON CONFLICT DO NOTHING`: гонка добавления одного
   * пользователя дважды не роняет запрос. Возвращает userId вставленных строк.
   */
  async insertIgnore(
    memberships: Array<Pick<ChatMember, "chatId" | "userId" | "role">>,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (memberships.length === 0) return [];

    const repo = manager ? manager.getRepository(ChatMember) : this;
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(ChatMember)
      .values(memberships)
      .orIgnore()
      .returning("user_id")
      .execute();
    const rows = (result.raw ?? []) as Array<{ user_id: string }>;

    return rows.map(r => r.user_id);
  }

  /** Какие из переданных пользователей существуют. */
  async findExistingUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const users = await this.manager.getRepository(User).find({
      where: { id: In(userIds) },
      select: { id: true },
    });

    return users.map(u => u.id);
  }

  /** Сменить роль участника. */
  async setRole(
    chatId: string,
    userId: string,
    role: EChatMemberRole,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ChatMember) : this;

    await repo.update({ chatId, userId }, { role });
  }

  /** Скрыть direct-чат у пользователя. */
  async hideMembership(chatId: string, userId: string): Promise<void> {
    await this.update({ chatId, userId }, { hiddenAt: new Date() });
  }

  /**
   * Вернуть скрытый direct-чат всем участникам. Вызывается при новом
   * сообщении в чате.
   */
  async unhideForChat(chatId: string): Promise<void> {
    await this.update({ chatId, hiddenAt: Not(IsNull()) }, { hiddenAt: null });
  }

  /** Снять скрытие direct-чата у конкретного пользователя. */
  async unhideMembership(chatId: string, userId: string): Promise<void> {
    await this.update({ chatId, userId }, { hiddenAt: null });
  }

  /** Все чаты, где пользователь — владелец. */
  async findOwnedMemberships(userId: string) {
    return this.find({
      where: { userId, role: EChatMemberRole.OWNER },
      select: { id: true, chatId: true },
    });
  }

  /**
   * Кандидат на владение: старейший ADMIN, иначе старейший участник
   * (кроме исключаемого пользователя).
   */
  async findOwnershipCandidate(
    chatId: string,
    excludeUserId: string | null,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(ChatMember) : this;
    const qb = repo
      .createQueryBuilder("m")
      .where("m.chatId = :chatId", { chatId })
      .orderBy(
        `CASE WHEN m.role = '${EChatMemberRole.ADMIN}' THEN 0 ELSE 1 END`,
        "ASC",
      )
      .addOrderBy("m.joinedAt", "ASC")
      .addOrderBy("m.id", "ASC");

    if (excludeUserId) {
      qb.andWhere("m.userId != :excludeUserId", { excludeUserId });
    }

    return qb.getOne();
  }

  /**
   * Атомарный инкремент unread_count для всех участников чата, кроме отправителя.
   * Один запрос вместо N отдельных getUnreadCount + setCount.
   */
  async incrementUnreadForChat(
    chatId: string,
    excludeUserId: string,
  ): Promise<void> {
    await this.createQueryBuilder()
      .update()
      .set({ unreadCount: () => "unread_count + 1" })
      .where("chatId = :chatId", { chatId })
      .andWhere("userId != :excludeUserId", { excludeUserId })
      .execute();
  }

  /**
   * Декремент unread_count для участников, у которых удалённое сообщение было непрочитанным.
   * Непрочитано = lastReadMessageId IS NULL OR lastReadMessage.createdAt < messageCreatedAt.
   */
  async decrementUnreadForDeletedMessage(
    chatId: string,
    senderId: string,
    messageCreatedAt: Date,
  ): Promise<void> {
    // COALESCE: если lastReadMessage удалён (subquery → NULL),
    // считаем что ничего не прочитано (epoch) → декремент сработает.
    await this.query(
      `UPDATE chat_members
       SET unread_count = GREATEST(0, unread_count - 1)
       WHERE chat_id = $1
         AND user_id != $2
         AND unread_count > 0
         AND (
           last_read_message_id IS NULL
           OR COALESCE(
             (SELECT created_at FROM messages WHERE id = last_read_message_id),
             '1970-01-01'::timestamptz
           ) < $3
         )`,
      [chatId, senderId, messageCreatedAt],
    );
  }

  /** Сбросить unread_count в 0 для конкретного пользователя в чате. */
  async resetUnreadCount(chatId: string, userId: string): Promise<void> {
    await this.createQueryBuilder()
      .update()
      .set({ unreadCount: 0 })
      .where("chatId = :chatId", { chatId })
      .andWhere("userId = :userId", { userId })
      .execute();
  }

  /**
   * Получить unread_count для всех чатов пользователя.
   * Простой SELECT вместо COUNT(*) с коррелированным подзапросом.
   */
  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const rows = await this.find({
      where: { userId },
      select: { chatId: true, unreadCount: true },
    });

    const result: Record<string, number> = {};

    for (const row of rows) {
      if (row.unreadCount > 0) {
        result[row.chatId] = row.unreadCount;
      }
    }

    return result;
  }

  /** Получить userId + unreadCount для всех участников чата (без JOIN на user/profile). */
  async getMembersUnreadCounts(
    chatId: string,
  ): Promise<Array<{ userId: string; unreadCount: number }>> {
    return this.find({
      where: { chatId },
      select: { userId: true, unreadCount: true },
    });
  }

  /** Получить все chatId, в которых пользователь состоит. */
  async getUserChatIds(userId: string): Promise<string[]> {
    const members = await this.find({
      where: { userId },
      select: { chatId: true },
    });

    return members.map(m => m.chatId);
  }

  /** Найти всех собеседников пользователя в прямых (direct) чатах. */
  async findDirectChatPartnerIds(userId: string): Promise<string[]> {
    const results = await this.createQueryBuilder("m1")
      .innerJoin("m1.chat", "chat")
      .innerJoin(
        ChatMember,
        "m2",
        "m2.chatId = chat.id AND m2.userId != :userId",
        { userId },
      )
      .select("DISTINCT m2.userId", "partnerId")
      .where("m1.userId = :userId", { userId })
      .andWhere("chat.type = :type", { type: EChatType.DIRECT })
      .getRawMany<{ partnerId: string }>();

    return results.map(r => r.partnerId);
  }
}
