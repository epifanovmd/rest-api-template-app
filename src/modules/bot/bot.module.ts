import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { BotController } from "./bot.controller";
import { BotListener } from "./bot.listener";
import { BotRepository } from "./bot.repository";
import { BotService } from "./bot.service";
import { BotApiController } from "./bot-api.controller";
import { BotCommandRepository } from "./bot-command.repository";
import { WebhookService } from "./webhook.service";

@Module({
  providers: [
    BotRepository,
    BotCommandRepository,
    BotService,
    WebhookService,
    BotController,
    BotApiController,
    asSocketListener(BotListener),
  ],
})
export class BotModule {}
