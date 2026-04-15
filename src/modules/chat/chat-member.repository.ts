import { In } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { EChatType } from "./chat.types";
import { ChatMember } from "./chat-member.entity";

@InjectableRepository(ChatMember)
export class ChatMemberRepository extends BaseRepository<ChatMember> {
  async findMembership(chatId: string, userId: string) {
    return this.findOne({
      where: { chatId, userId },
    });
  }

  async findMembershipsByChat(chatId: string, userIds: string[]): Promise<ChatMember[]> {
    if (userIds.length === 0) return [];

    return this.find({
      where: { chatId, userId: In(userIds) },
    });
  }

  async findChatMembers(chatId: string) {
    return this.find({
      where: { chatId },
      relations: { user: { profile: true } },
    });
  }

  async countMembers(chatId: string) {
    return this.count({ where: { chatId } });
  }

  async getMemberUserIds(chatId: string): Promise<string[]> {
    const members = await this.find({
      where: { chatId },
      select: ["userId"],
    });

    return members.map(m => m.userId);
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
  async getUnreadCounts(
    userId: string,
  ): Promise<Record<string, number>> {
    const rows = await this.find({
      where: { userId },
      select: ["chatId", "unreadCount"],
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
      select: ["userId", "unreadCount"],
    });
  }

  /** Получить все chatId, в которых пользователь состоит. */
  async getUserChatIds(userId: string): Promise<string[]> {
    const members = await this.find({
      where: { userId },
      select: ["chatId"],
    });

    return members.map(m => m.chatId);
  }

  /** Найти всех собеседников пользователя в прямых (direct) чатах. */
  async findDirectChatPartnerIds(userId: string): Promise<string[]> {
    const results = await this.createQueryBuilder("m1")
      .innerJoin("m1.chat", "chat")
      .innerJoin(ChatMember, "m2", "m2.chatId = chat.id AND m2.userId != :userId", { userId })
      .select("DISTINCT m2.userId", "partnerId")
      .where("m1.userId = :userId", { userId })
      .andWhere("chat.type = :type", { type: EChatType.DIRECT })
      .getRawMany<{ partnerId: string }>();

    return results.map(r => r.partnerId);
  }
}
