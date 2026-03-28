import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { WebhookLog } from "./webhook-log.entity";

@InjectableRepository(WebhookLog)
export class WebhookLogRepository extends BaseRepository<WebhookLog> {
  async findByBotId(
    botId: string,
    options?: { limit?: number; offset?: number },
  ) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const [data, totalCount] = await this.findAndCount({
      where: { botId },
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return { data, totalCount };
  }

  /** Remove logs older than given date to keep the table lean */
  async pruneOlderThan(botId: string, date: Date) {
    return this.createQueryBuilder()
      .delete()
      .where("bot_id = :botId AND created_at < :date", { botId, date })
      .execute();
  }
}
