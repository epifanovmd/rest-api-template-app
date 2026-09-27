import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition, logger } from "../../core";
import {
  BOT_WEBHOOK_LOG_RETENTION_DAYS,
  BOT_WEBHOOK_LOGS_CLEANUP_QUEUE,
} from "./bot.types";
import { WebhookService } from "./webhook.service";

/** Retention журнала доставок вебхуков: раз в сутки удаляет записи старше 30 дней. */
@Injectable()
export class BotWebhookLogsCleanupJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: BOT_WEBHOOK_LOGS_CLEANUP_QUEUE,
    cron: "45 3 * * *",
    retryLimit: 2,
    expireInSeconds: 30 * 60,
  };

  constructor(
    @inject(WebhookService) private readonly _webhooks: WebhookService,
  ) {}

  async handle(): Promise<void> {
    const deleted = await this._webhooks.cleanupLogs(
      BOT_WEBHOOK_LOG_RETENTION_DAYS,
    );

    if (deleted > 0) {
      logger.info(
        { deleted, retentionDays: BOT_WEBHOOK_LOG_RETENTION_DAYS },
        "[Bot] Webhook logs cleanup completed",
      );
    }
  }
}
