import crypto from "crypto";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import {
  EventBus,
  Injectable,
  isUniqueViolation,
  normalizePagination,
  toPage,
} from "../../core";
import { ChatService } from "../chat";
import { FileUrlService } from "../file";
import { EMessageType, MessageRepository, MessageService } from "../message";
import { Profile } from "../profile/profile.entity";
import { User } from "../user/user.entity";
import { Bot } from "./bot.entity";
import { BotError } from "./bot.errors";
import { BotRepository } from "./bot.repository";
import { BotCommand } from "./bot-command.entity";
import { BotCommandRepository } from "./bot-command.repository";
import { BotDetailDto, BotDto, collectBotFiles } from "./dto/bot.dto";
import { BotCreatedEvent, BotDeletedEvent, BotUpdatedEvent } from "./events";

/**
 * Хеш пароля технического пользователя бота. Не является валидным форматом
 * `core/auth/password` — `verifyPassword` всегда вернёт false, вход невозможен.
 */
const BOT_USER_PASSWORD_HASH = "!bot";

/** Длина имени в профиле (`profiles.first_name`). */
const PROFILE_NAME_MAX_LENGTH = 40;

const toProfileName = (displayName: string) =>
  displayName.slice(0, PROFILE_NAME_MAX_LENGTH);

@Injectable()
export class BotService {
  constructor(
    @inject(BotRepository) private _botRepo: BotRepository,
    @inject(BotCommandRepository) private _cmdRepo: BotCommandRepository,
    @inject(DataSource) private _dataSource: DataSource,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(ChatService) private _chatService: ChatService,
    @inject(MessageService) private _messageService: MessageService,
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
  ) {}

  /** `BotDetailDto` с подписанным аватаром. */
  toDetailDto(bot: Bot): Promise<BotDetailDto> {
    return this._fileUrls.buildOneWithFiles(
      bot,
      collectBotFiles,
      BotDetailDto.fromEntity,
    );
  }

  /** Создать бота вместе с его техническим пользователем и профилем. */
  async createBot(
    ownerId: string,
    data: { username: string; displayName: string; description?: string },
  ) {
    const existing = await this._botRepo.findByUsername(data.username);

    if (existing) throw BotError.USERNAME_TAKEN();

    const token = crypto.randomBytes(64).toString("hex");

    const botId = await this._createBotWithUser(ownerId, data, token).catch(
      (err: unknown) => {
        if (isUniqueViolation(err)) throw BotError.USERNAME_TAKEN();
        throw err;
      },
    );

    const bot = await this._botRepo.findByIdWithDetails(botId);

    if (!bot) throw BotError.NOT_FOUND();

    this._eventBus.emit(new BotCreatedEvent(bot.id, ownerId));

    return bot;
  }

  /** Боты владельца страницей. */
  async getMyBots(ownerId: string, offset?: number, limit?: number) {
    const page = normalizePagination(offset, limit);
    const [bots, total] = await this._botRepo.findPageByOwnerId(ownerId, page);

    const dtos = await this._fileUrls.buildWithFiles(
      bots,
      collectBotFiles,
      BotDto.fromEntity,
    );

    return toPage(dtos, total, page);
  }

  async getBotById(botId: string, ownerId: string) {
    const bot = await this._botRepo.findByIdWithDetails(botId);

    if (!bot) throw BotError.NOT_FOUND();
    if (bot.ownerId !== ownerId) throw BotError.ACCESS_DENIED();

    return bot;
  }

  /** Технический пользователь, профиль и бот — одной транзакцией. */
  private async _createBotWithUser(
    ownerId: string,
    data: { username: string; displayName: string; description?: string },
    token: string,
  ) {
    return this._dataSource.transaction(async manager => {
      const userRepo = manager.getRepository(User);
      const profileRepo = manager.getRepository(Profile);
      const botRepo = manager.getRepository(Bot);

      const user = await userRepo.save(
        userRepo.create({
          email: null,
          phone: null,
          passwordHash: BOT_USER_PASSWORD_HASH,
        }),
      );

      await profileRepo.save(
        profileRepo.create({
          userId: user.id,
          firstName: toProfileName(data.displayName),
        }),
      );

      const bot = await botRepo.save(
        botRepo.create({
          ownerId,
          userId: user.id,
          username: data.username,
          displayName: data.displayName,
          description: data.description ?? null,
          token,
        }),
      );

      return bot.id;
    });
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

    await this._dataSource.transaction(async manager => {
      await manager.getRepository(Bot).save(bot);

      if (data.displayName !== undefined) {
        await manager
          .getRepository(Profile)
          .update(
            { userId: bot.userId },
            { firstName: toProfileName(data.displayName) },
          );
      }
    });

    this._eventBus.emit(new BotUpdatedEvent(botId, ownerId));

    return this._getWithDetails(botId);
  }

  /** Удаляет бота и его технического пользователя (членства в чатах — каскадом). */
  async deleteBot(botId: string, ownerId: string) {
    const bot = await this.getBotById(botId, ownerId);

    await this._dataSource.transaction(async manager => {
      await manager.getRepository(Bot).delete({ id: bot.id });
      await manager.getRepository(User).delete({ id: bot.userId });
    });

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
    bot.webhookFailureCount = 0;
    bot.webhookDisabledAt = null;
    await this._botRepo.save(bot);

    return bot;
  }

  async deleteWebhook(botId: string, ownerId: string) {
    const bot = await this.getBotById(botId, ownerId);

    bot.webhookUrl = null;
    bot.webhookSecret = null;
    bot.webhookEvents = [];
    bot.webhookFailureCount = 0;
    bot.webhookDisabledAt = null;
    await this._botRepo.save(bot);
  }

  async updateWebhookEvents(botId: string, ownerId: string, events: string[]) {
    const bot = await this.getBotById(botId, ownerId);

    bot.webhookEvents = events;
    await this._botRepo.save(bot);

    return this._getWithDetails(botId);
  }

  async setCommands(
    botId: string,
    ownerId: string,
    commands: { command: string; description: string }[],
  ) {
    await this.getBotById(botId, ownerId);

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

  /** Активный бот по токену; null — токен неверный или бот отключён. */
  async findByToken(token: string): Promise<Bot | null> {
    if (!token) return null;

    return this._botRepo.findByToken(token);
  }

  /** Активный бот по токену; неверный токен → 401. */
  async getBotByToken(token: string): Promise<Bot> {
    const bot = await this.findByToken(token);

    if (!bot) throw BotError.INVALID_TOKEN();

    return bot;
  }

  /**
   * Добавить бота в группу участником (MEMBER). Права актёра (владелец или
   * админ чата) и тип чата проверяет модуль чатов.
   */
  async addBotToChat(botId: string, chatId: string, actorId: string) {
    const bot = await this._getActiveBot(botId);

    await this._chatService.addMembers(chatId, actorId, [bot.userId]);
  }

  /** Удалить бота из чата (владелец или админ чата). */
  async removeBotFromChat(botId: string, chatId: string, actorId: string) {
    const bot = await this._getActiveBot(botId, false);

    await this._chatService.removeMember(chatId, actorId, bot.userId);
  }

  /** Bot-API: текстовое сообщение от имени бота в чат, где он участник. */
  async sendMessage(
    bot: Bot,
    data: { chatId: string; content: string; replyToId?: string },
  ) {
    await this._assertBotInChat(bot, data.chatId);

    return this._messageService.sendMessage(data.chatId, bot.userId, {
      type: EMessageType.TEXT,
      content: data.content,
      replyToId: data.replyToId,
    });
  }

  /** Bot-API: редактировать своё сообщение в чате, где бот участник. */
  async editMessage(bot: Bot, messageId: string, content: string) {
    await this._assertMessageInBotChat(bot, messageId);

    return this._messageService.editMessage(messageId, bot.userId, content);
  }

  /** Bot-API: удалить сообщение для всех (права — как у участника MEMBER). */
  async deleteMessage(bot: Bot, messageId: string) {
    await this._assertMessageInBotChat(bot, messageId);

    await this._messageService.deleteMessage(messageId, bot.userId, true);
  }

  private async _getWithDetails(botId: string) {
    const bot = await this._botRepo.findByIdWithDetails(botId);

    if (!bot) throw BotError.NOT_FOUND();

    return bot;
  }

  private async _getActiveBot(botId: string, requireActive = true) {
    const bot = await this._botRepo.findOne({ where: { id: botId } });

    if (!bot) throw BotError.NOT_FOUND();
    if (requireActive && !bot.isActive) throw BotError.INACTIVE();

    return bot;
  }

  private async _assertBotInChat(bot: Bot, chatId: string) {
    if (!(await this._chatService.isMember(chatId, bot.userId))) {
      throw BotError.NOT_CHAT_MEMBER();
    }
  }

  private async _assertMessageInBotChat(bot: Bot, messageId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) throw BotError.MESSAGE_NOT_FOUND();

    await this._assertBotInChat(bot, message.chatId);
  }
}
