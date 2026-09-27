import { asJobHandler, asSecurityScheme, Module } from "../../core";
import { asFileUsageProbe } from "../file";
import { asSocketListener } from "../socket";
import { BotController } from "./bot.controller";
import { Bot } from "./bot.entity";
import { BotListener } from "./bot.listener";
import { BotRepository } from "./bot.repository";
import { BotSecurityScheme } from "./bot.scheme";
import { BotService } from "./bot.service";
import { BotApiController } from "./bot-api.controller";
import { BotAvatarUsageProbe } from "./bot-avatar.probe";
import { BotCommand } from "./bot-command.entity";
import { BotCommandRepository } from "./bot-command.repository";
import { BotWebhookJob } from "./bot-webhook.job";
import { BotWebhookLogsCleanupJob } from "./bot-webhook-logs-cleanup.job";
import { WebhookService } from "./webhook.service";
import { WebhookLog } from "./webhook-log.entity";
import { WebhookLogRepository } from "./webhook-log.repository";

@Module({
  entities: [Bot, BotCommand, WebhookLog],
  providers: [
    asFileUsageProbe(BotAvatarUsageProbe),
    BotRepository,
    BotCommandRepository,
    WebhookLogRepository,
    BotService,
    WebhookService,
    BotController,
    BotApiController,
    asSocketListener(BotListener),
    asSecurityScheme(BotSecurityScheme),
    asJobHandler(BotWebhookJob),
    asJobHandler(BotWebhookLogsCleanupJob),
  ],
})
export class BotModule {}
