import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { BotCommand } from "./bot-command.entity";

@InjectableRepository(BotCommand)
export class BotCommandRepository extends BaseRepository<BotCommand> {
  async findByBotId(botId: string) {
    return this.find({ where: { botId }, order: { command: "ASC" } });
  }
}
