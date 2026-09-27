import { EntityManager, In, IsNull, MoreThan } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { ChatBan } from "./chat-ban.entity";

@InjectableRepository(ChatBan)
export class ChatBanRepository extends BaseRepository<ChatBan> {
  /** Действующий бан: бессрочный или с не наступившим `until`. */
  async findActiveBan(chatId: string, userId: string) {
    return this.findOne({
      where: [
        { chatId, userId, until: IsNull() },
        { chatId, userId, until: MoreThan(new Date()) },
      ],
    });
  }

  /** Действующие баны чата постранично, с профилем забаненного. */
  async findActiveBans(chatId: string, offset: number, limit: number) {
    return this.findAndCount({
      where: [
        { chatId, until: IsNull() },
        { chatId, until: MoreThan(new Date()) },
      ],
      relations: { user: { profile: true } },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /** Кто из переданных пользователей сейчас забанен в чате. */
  async findActiveBannedUserIds(
    chatId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];

    const bans = await this.find({
      where: [
        { chatId, userId: In(userIds), until: IsNull() },
        { chatId, userId: In(userIds), until: MoreThan(new Date()) },
      ],
      select: { userId: true },
    });

    return bans.map(b => b.userId);
  }

  /** Создать или обновить бан (повторный бан продлевает/меняет условия). */
  async upsertBan(
    data: Pick<
      ChatBan,
      "chatId" | "userId" | "bannedById" | "reason" | "until"
    >,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ChatBan) : this;

    await repo.upsert(data, ["chatId", "userId"]);
  }

  /** Снять бан. `false` — бана не было. */
  async removeBan(chatId: string, userId: string): Promise<boolean> {
    const result = await this.delete({ chatId, userId });

    return (result.affected ?? 0) > 0;
  }
}
