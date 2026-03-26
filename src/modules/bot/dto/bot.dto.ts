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
  commands: BotCommandDto[];

  constructor(entity: Bot) {
    super(entity);
    this.token = entity.token;
    this.webhookUrl = entity.webhookUrl;
    this.commands = entity.commands?.map(BotCommandDto.fromEntity) ?? [];
  }

  static fromEntity(entity: Bot) {
    return new BotDetailDto(entity);
  }
}
