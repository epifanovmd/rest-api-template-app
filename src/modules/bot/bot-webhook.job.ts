import { inject } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  JobError,
} from "../../core";
import { BotWebhookErrorCode } from "./bot.errors";
import {
  BOT_WEBHOOK_QUEUE,
  IBotWebhookJobData,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAY_SECONDS,
} from "./bot.types";
import { WebhookService } from "./webhook.service";

/**
 * Задача `bot.webhook`: одна попытка доставки события боту. Провал —
 * `JobError` для повтора с экспоненциальной задержкой; последний провал
 * засчитывается в серию, после которой вебхук отключается.
 */
@Injectable()
export class BotWebhookJob implements IJobHandler<IBotWebhookJobData> {
  readonly definition: JobDefinition = {
    queue: BOT_WEBHOOK_QUEUE,
    retryLimit: WEBHOOK_MAX_ATTEMPTS - 1,
    retryDelaySeconds: WEBHOOK_RETRY_DELAY_SECONDS,
    retryBackoff: true,
    expireInSeconds: 60,
  };

  constructor(
    @inject(WebhookService) private readonly _webhooks: WebhookService,
  ) {}

  async handle(ctx: JobContext<IBotWebhookJobData>): Promise<void> {
    const result = await this._webhooks.attemptDelivery(ctx.data, ctx.attempt);

    if (!result || result.success) return;

    const isLastAttempt =
      result.permanent || ctx.attempt + 1 >= WEBHOOK_MAX_ATTEMPTS;

    if (isLastAttempt) {
      await this._webhooks.registerFailedDelivery(
        ctx.data.botId,
        result.errorMessage,
      );
    }

    throw new JobError(
      BotWebhookErrorCode.DELIVERY_FAILED,
      result.errorMessage ?? "Вебхук не доставлен",
      !isLastAttempt,
    );
  }
}
