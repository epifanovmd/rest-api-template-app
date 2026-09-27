import { In, IsNull, Not } from "typeorm";

import { InjectableRepository, Pagination } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Bot } from "./bot.entity";

@InjectableRepository(Bot)
export class BotRepository extends BaseRepository<Bot> {
  async findByToken(token: string) {
    return this.findOne({
      where: { token, isActive: true },
      relations: { commands: true },
    });
  }

  async findByUsername(username: string) {
    return this.findOne({ where: { username } });
  }

  /** Боты владельца страницей, новые первыми. */
  async findPageByOwnerId(ownerId: string, { offset, limit }: Pagination) {
    return this.findAndCount({
      where: { ownerId },
      relations: { avatar: true },
      order: { createdAt: "DESC", id: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  async findByIdWithDetails(id: string) {
    return this.findOne({
      where: { id },
      relations: { commands: true, avatar: true },
    });
  }

  /**
   * Активные боты с работающим вебхуком среди указанных пользователей
   * (участников чата).
   */
  async findWebhookBotsByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];

    return this.find({
      where: {
        userId: In(userIds),
        isActive: true,
        webhookUrl: Not(IsNull()),
        webhookDisabledAt: IsNull(),
      },
    });
  }

  /** Атомарно увеличить счётчик провалов; возвращает новое значение. */
  async incrementWebhookFailures(botId: string): Promise<number> {
    const result = await this.createQueryBuilder()
      .update(Bot)
      .set({ webhookFailureCount: () => "webhook_failure_count + 1" })
      .where("id = :botId", { botId })
      .returning(["webhookFailureCount"])
      .execute();

    const row = (result.raw as { webhook_failure_count?: number }[])[0];

    return Number(row?.webhook_failure_count ?? 0);
  }

  /** Сбросить счётчик провалов, если он не нулевой. */
  async resetWebhookFailures(botId: string): Promise<void> {
    await this.createQueryBuilder()
      .update(Bot)
      .set({ webhookFailureCount: 0 })
      .where("id = :botId AND webhook_failure_count > 0", { botId })
      .execute();
  }

  /**
   * Отключить вебхук, если счётчик провалов достиг порога и вебхук ещё не
   * отключён. `true` — отключил именно этот вызов (событие шлётся один раз).
   */
  async disableWebhookIfFailing(
    botId: string,
    threshold: number,
  ): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(Bot)
      .set({ webhookDisabledAt: () => "now()" })
      .where(
        "id = :botId AND webhook_disabled_at IS NULL AND webhook_failure_count >= :threshold",
        { botId, threshold },
      )
      .execute();

    return (result.affected ?? 0) > 0;
  }
}
