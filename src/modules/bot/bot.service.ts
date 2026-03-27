import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import crypto from "crypto";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { BotRepository } from "./bot.repository";
import { BotCommand } from "./bot-command.entity";
import { BotCommandRepository } from "./bot-command.repository";
import { BotCreatedEvent, BotDeletedEvent, BotUpdatedEvent } from "./events";

@Injectable()
export class BotService {
  constructor(
    @inject(BotRepository) private _botRepo: BotRepository,
    @inject(BotCommandRepository) private _cmdRepo: BotCommandRepository,
    @inject(DataSource) private _dataSource: DataSource,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async createBot(
    ownerId: string,
    data: { username: string; displayName: string; description?: string },
  ) {
    const existing = await this._botRepo.findByUsername(data.username);

    if (existing) {
      throw new BadRequestException("Этот username уже занят");
    }

    const token = crypto.randomBytes(64).toString("hex");

    const bot = await this._botRepo.createAndSave({
      ownerId,
      username: data.username,
      displayName: data.displayName,
      description: data.description ?? null,
      token,
    });

    this._eventBus.emit(new BotCreatedEvent(bot.id, ownerId));

    return bot;
  }

  async getMyBots(ownerId: string) {
    return this._botRepo.findByOwnerId(ownerId);
  }

  async getBotById(botId: string, ownerId: string) {
    const bot = await this._botRepo.findByIdWithDetails(botId);

    if (!bot) throw new NotFoundException("Бот не найден");
    if (bot.ownerId !== ownerId) {
      throw new ForbiddenException("Нет доступа к этому боту");
    }

    return bot;
  }

  async updateBot(
    botId: string,
    ownerId: string,
    data: {
      displayName?: string;
      description?: string | null;
      avatarId?: string | null;
    },
  ) {
    const bot = await this.getBotById(botId, ownerId);

    if (data.displayName !== undefined) bot.displayName = data.displayName;
    if (data.description !== undefined) bot.description = data.description;
    if (data.avatarId !== undefined) bot.avatarId = data.avatarId;

    await this._botRepo.save(bot);

    this._eventBus.emit(new BotUpdatedEvent(botId, ownerId));

    return this._botRepo.findByIdWithDetails(botId);
  }

  async deleteBot(botId: string, ownerId: string) {
    const bot = await this.getBotById(botId, ownerId);

    await this._botRepo.delete({ id: bot.id });

    this._eventBus.emit(new BotDeletedEvent(botId, ownerId));
  }

  async regenerateToken(botId: string, ownerId: string) {
    const bot = await this.getBotById(botId, ownerId);

    bot.token = crypto.randomBytes(64).toString("hex");
    await this._botRepo.save(bot);

    return bot;
  }

  async setWebhook(
    botId: string,
    ownerId: string,
    url: string,
    secret?: string,
  ) {
    const bot = await this.getBotById(botId, ownerId);

    bot.webhookUrl = url;
    bot.webhookSecret = secret ?? crypto.randomBytes(32).toString("hex");
    await this._botRepo.save(bot);

    return bot;
  }

  async deleteWebhook(botId: string, ownerId: string) {
    const bot = await this.getBotById(botId, ownerId);

    bot.webhookUrl = null;
    bot.webhookSecret = null;
    await this._botRepo.save(bot);
  }

  async setCommands(
    botId: string,
    ownerId: string,
    commands: { command: string; description: string }[],
  ) {
    await this.getBotById(botId, ownerId);

    // Delete existing and insert new in a transaction
    await this._dataSource.transaction(async manager => {
      const cmdRepo = manager.getRepository(BotCommand);

      await cmdRepo.delete({ botId });

      const entities = commands.map(cmd =>
        cmdRepo.create({
          botId,
          command: cmd.command,
          description: cmd.description,
        }),
      );

      await cmdRepo.save(entities);
    });

    return this._cmdRepo.findByBotId(botId);
  }

  async getCommands(botId: string) {
    return this._cmdRepo.findByBotId(botId);
  }

  async getBotByToken(token: string) {
    const bot = await this._botRepo.findByToken(token);

    if (!bot) throw new NotFoundException("Бот не найден");

    return bot;
  }
}
