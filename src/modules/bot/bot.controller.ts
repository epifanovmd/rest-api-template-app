import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { BotService } from "./bot.service";
import { BotCommandDto, BotDetailDto, BotDto } from "./dto/bot.dto";
import {
  CreateBotSchema,
  SetCommandsSchema,
  SetWebhookSchema,
} from "./validation";

interface ICreateBotBody {
  username: string;
  displayName: string;
  description?: string;
}

interface IUpdateBotBody {
  displayName?: string;
  description?: string | null;
  avatarId?: string | null;
}

interface ISetWebhookBody {
  url: string;
  secret?: string;
}

interface ISetCommandsBody {
  commands: { command: string; description: string }[];
}

@Injectable()
@Tags("Bot")
@Route("api/bot")
export class BotController extends Controller {
  constructor(@inject(BotService) private _botService: BotService) {
    super();
  }

  /** @summary Создать бота */
  @Security("jwt")
  @ValidateBody(CreateBotSchema)
  @Post()
  async createBot(
    @Request() req: KoaRequest,
    @Body() body: ICreateBotBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.createBot(user.userId, body);

    return BotDetailDto.fromEntity(bot);
  }

  /** @summary Мои боты */
  @Security("jwt")
  @Get()
  async getMyBots(@Request() req: KoaRequest): Promise<BotDto[]> {
    const user = getContextUser(req);
    const bots = await this._botService.getMyBots(user.userId);

    return bots.map(BotDto.fromEntity);
  }

  /** @summary Детали бота */
  @Security("jwt")
  @Get("{id}")
  async getBotById(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.getBotById(id, user.userId);

    return BotDetailDto.fromEntity(bot);
  }

  /** @summary Обновить бота */
  @Security("jwt")
  @Patch("{id}")
  async updateBot(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: IUpdateBotBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.updateBot(id, user.userId, body);

    return BotDetailDto.fromEntity(bot!);
  }

  /** @summary Удалить бота */
  @Security("jwt")
  @Delete("{id}")
  async deleteBot(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._botService.deleteBot(id, user.userId);
  }

  /** @summary Перегенерировать токен */
  @Security("jwt")
  @Post("{id}/token")
  async regenerateToken(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.regenerateToken(id, user.userId);

    return BotDetailDto.fromEntity(bot);
  }

  /** @summary Установить webhook */
  @Security("jwt")
  @ValidateBody(SetWebhookSchema)
  @Post("{id}/webhook")
  async setWebhook(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: ISetWebhookBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.setWebhook(
      id,
      user.userId,
      body.url,
      body.secret,
    );

    return BotDetailDto.fromEntity(bot);
  }

  /** @summary Удалить webhook */
  @Security("jwt")
  @Delete("{id}/webhook")
  async deleteWebhook(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._botService.deleteWebhook(id, user.userId);
  }

  /** @summary Установить команды бота */
  @Security("jwt")
  @ValidateBody(SetCommandsSchema)
  @Post("{id}/commands")
  async setCommands(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: ISetCommandsBody,
  ): Promise<BotCommandDto[]> {
    const user = getContextUser(req);
    const commands = await this._botService.setCommands(
      id,
      user.userId,
      body.commands,
    );

    return commands.map(BotCommandDto.fromEntity);
  }

  /** @summary Получить команды бота */
  @Security("jwt")
  @Get("{id}/commands")
  async getCommands(@Path() id: string): Promise<BotCommandDto[]> {
    const commands = await this._botService.getCommands(id);

    return commands.map(BotCommandDto.fromEntity);
  }
}
