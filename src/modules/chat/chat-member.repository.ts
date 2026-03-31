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
