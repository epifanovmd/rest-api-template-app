import { EntityManager } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { ChatInvite } from "./chat-invite.entity";

@InjectableRepository(ChatInvite)
export class ChatInviteRepository extends BaseRepository<ChatInvite> {
  async findByCode(code: string) {
    return this.findOne({
      where: { code },
      relations: { chat: true },
    });
  }

  /** Активные приглашения чата постранично (новые первыми). */
  async findByChatId(chatId: string, offset: number, limit: number) {
    return this.findAndCount({
      where: { chatId, isActive: true },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Атомарно расходует одно использование приглашения. `false` — лимит
   * исчерпан, ссылка отозвана или истекла (проверка и инкремент в одном UPDATE,
   * гонка двух вступлений не превысит `maxUses`).
   */
  async consumeUse(
    inviteId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(ChatInvite) : this;
    const result = await repo
      .createQueryBuilder()
      .update(ChatInvite)
      .set({ useCount: () => "use_count + 1" })
      .where("id = :inviteId", { inviteId })
      .andWhere("is_active = true")
      .andWhere("(max_uses IS NULL OR use_count < max_uses)")
      .andWhere("(expires_at IS NULL OR expires_at > NOW())")
      .execute();

    return (result.affected ?? 0) > 0;
  }
}
