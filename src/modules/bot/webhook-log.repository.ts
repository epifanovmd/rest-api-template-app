import { InjectableRepository, Pagination } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { WebhookLog } from "./webhook-log.entity";

@InjectableRepository(WebhookLog)
export class WebhookLogRepository extends BaseRepository<WebhookLog> {
  /** Журнал доставок бота страницей, новые первыми. */
  async findPageByBotId(botId: string, { offset, limit }: Pagination) {
    return this.findAndCount({
      where: { botId },
      order: { createdAt: "DESC", id: "DESC" },
      take: limit,
      skip: offset,
    });
  }

  /** Удалить записи старше `before` пачками (без долгих блокировок); вернуть число удалённых. */
  async deleteOlderThan(before: Date, batchSize = 5000): Promise<number> {
    let total = 0;

    for (;;) {
      const rows: Array<{ id: string }> = await this.query(
        `DELETE FROM webhook_logs WHERE id IN (
           SELECT id FROM webhook_logs WHERE created_at < $1 LIMIT $2
         ) RETURNING id`,
        [before, batchSize],
      );

      total += rows.length;

      if (rows.length < batchSize) return total;
    }
  }
}
