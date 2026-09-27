import { BaseDto } from "../../../core/dto/BaseDto";
import { signedUrlOf, type TFileRef, type TSignedFiles } from "../../file";
import { Bot } from "../bot.entity";
import { BotCommand } from "../bot-command.entity";
import { WebhookLog } from "../webhook-log.entity";

export class BotCommandDto extends BaseDto {
  command: string;
  description: string;

  constructor(entity: BotCommand) {
    super(entity);
    this.command = entity.command;
    this.description = entity.description;
  }

  static fromEntity(entity: BotCommand) {
    return new BotCommandDto(entity);
  }
}

/** Аватары ботов — для подписи пачкой перед сборкой `BotDto`/`BotDetailDto`. */
export const collectBotFiles = (bots: ReadonlyArray<Bot>): TFileRef[] =>
  bots.map(bot => bot.avatar);

/** Бот; ссылка на аватар — из карты подписей `files`. */
export class BotDto extends BaseDto {
  id: string;
  /** Технический пользователь бота — отправитель его сообщений, участник чатов. */
  userId: string;
  username: string;
  displayName: string;
  description: string | null;
  /** Подписанная ссылка на аватар; срок ограничен. */
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;

  constructor(entity: Bot, files: TSignedFiles) {
    super(entity);
    this.id = entity.id;
    this.userId = entity.userId;
    this.username = entity.username;
    this.displayName = entity.displayName;
    this.description = entity.description;
    this.avatarUrl = signedUrlOf(entity.avatar, files);
    this.isActive = entity.isActive;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: Bot, files: TSignedFiles) {
    return new BotDto(entity, files);
  }
}

export class BotDetailDto extends BotDto {
  token: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[];
  /** Вебхук отключён автоматически после серии провалов; `null` — работает. */
  webhookDisabledAt: Date | null;
  /** Подряд проваленных доставок. */
  webhookFailureCount: number;
  commands: BotCommandDto[];

  constructor(entity: Bot, files: TSignedFiles) {
    super(entity, files);
    this.token = entity.token;
    this.webhookUrl = entity.webhookUrl;
    this.webhookSecret = entity.webhookSecret
      ? entity.webhookSecret.slice(0, 8) + "••••••••"
      : null;
    this.webhookEvents = entity.webhookEvents ?? [];
    this.webhookDisabledAt = entity.webhookDisabledAt ?? null;
    this.webhookFailureCount = entity.webhookFailureCount ?? 0;
    this.commands = entity.commands?.map(BotCommandDto.fromEntity) ?? [];
  }

  static fromEntity(entity: Bot, files: TSignedFiles) {
    return new BotDetailDto(entity, files);
  }
}

export class WebhookLogDto {
  id: string;
  /** Доставка, к которой относится попытка; `null` — тестовый ping. */
  deliveryId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  /** Номер попытки, с 1. */
  attempts: number;
  durationMs: number | null;
  createdAt: Date;

  constructor(entity: WebhookLog) {
    this.id = entity.id;
    this.deliveryId = entity.deliveryId ?? null;
    this.eventType = entity.eventType;
    this.payload = entity.payload;
    this.statusCode = entity.statusCode;
    this.success = entity.success;
    this.errorMessage = entity.errorMessage;
    this.attempts = entity.attempts;
    this.durationMs = entity.durationMs;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: WebhookLog) {
    return new WebhookLogDto(entity);
  }
}
