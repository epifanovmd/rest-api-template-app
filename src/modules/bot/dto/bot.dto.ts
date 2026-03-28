import { BaseDto } from "../../../core/dto/BaseDto";
import { Bot } from "../bot.entity";
import { BotCommand } from "../bot-command.entity";

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

export class BotDto extends BaseDto {
  id: string;
  username: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;

  constructor(entity: Bot) {
    super(entity);
    this.id = entity.id;
    this.username = entity.username;
    this.displayName = entity.displayName;
    this.description = entity.description;
    this.avatarUrl = entity.avatar?.url ?? null;
    this.isActive = entity.isActive;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: Bot) {
    return new BotDto(entity);
  }
}

export class BotDetailDto extends BotDto {
  token: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[];
  commands: BotCommandDto[];

  constructor(entity: Bot) {
    super(entity);
    this.token = entity.token;
    this.webhookUrl = entity.webhookUrl;
    this.webhookSecret = entity.webhookSecret
      ? entity.webhookSecret.slice(0, 8) + "••••••••"
      : null;
    this.webhookEvents = entity.webhookEvents ?? [];
    this.commands = entity.commands?.map(BotCommandDto.fromEntity) ?? [];
  }

  static fromEntity(entity: Bot) {
    return new BotDetailDto(entity);
  }
}

export class WebhookLogDto {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  attempts: number;
  durationMs: number | null;
  createdAt: Date;

  static fromEntity(entity: any) {
    const dto = new WebhookLogDto();

    dto.id = entity.id;
    dto.eventType = entity.eventType;
    dto.payload = entity.payload;
    dto.statusCode = entity.statusCode;
    dto.success = entity.success;
    dto.errorMessage = entity.errorMessage;
    dto.attempts = entity.attempts;
    dto.durationMs = entity.durationMs;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
