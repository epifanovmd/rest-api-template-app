import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto, IPaginatedDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { BotService } from "./bot.service";
import {
  BotCommandDto,
  BotDetailDto,
  BotDto,
  WebhookLogDto,
} from "./dto/bot.dto";
import {
  ICreateBotBody,
  ISetCommandsBody,
  ISetWebhookBody,
  ISetWebhookEventsBody,
  IUpdateBotBody,
  IWebhookTestResponse,
} from "./dto/bot-request.dto";
import {
  CreateBotSchema,
  SetCommandsSchema,
  SetWebhookEventsSchema,
  SetWebhookSchema,
} from "./validation";
import { WebhookService } from "./webhook.service";

@Injectable()
@Tags("Bot")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/bot")
export class BotController extends Controller {
  constructor(
    @inject(BotService) private _botService: BotService,
    @inject(WebhookService) private _webhookService: WebhookService,
  ) {
    super();
  }

  /**
   * Создать бота. Вместе с ботом создаётся его технический пользователь
   * (`userId`): от него бот состоит в чатах и пишет сообщения.
   * @summary Создать бота
   */
  @Security("jwt")
  @ValidateBody(CreateBotSchema)
  @SuccessResponse(201, "Created")
  @Post()
  async createBot(
    @Request() req: KoaRequest,
    @Body() body: ICreateBotBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.createBot(user.userId, body);

    return this._botService.toDetailDto(bot);
  }

  /**
   * Боты текущего пользователя, новые первыми.
   * @summary Мои боты
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get()
  async getMyBots(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<BotDto>> {
    const user = getContextUser(req);

    return this._botService.getMyBots(user.userId, offset, limit);
  }

  /** @summary Детали бота */
  @Security("jwt")
  @Get("{id}")
  async getBotById(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.getBotById(id, user.userId);

    return this._botService.toDetailDto(bot);
  }

  /** @summary Обновить бота */
  @Security("jwt")
  @Patch("{id}")
  async updateBot(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUpdateBotBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.updateBot(id, user.userId, body);

    return this._botService.toDetailDto(bot);
  }

  /** @summary Удалить бота */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteBot(@Request() req: KoaRequest, @Path() id: UUID): Promise<void> {
    const user = getContextUser(req);

    await this._botService.deleteBot(id, user.userId);
  }

  /** @summary Перегенерировать токен */
  @Security("jwt")
  @Post("{id}/token")
  async regenerateToken(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.regenerateToken(id, user.userId);

    return this._botService.toDetailDto(bot);
  }

  /** @summary Установить webhook */
  @Security("jwt")
  @ValidateBody(SetWebhookSchema)
  @Post("{id}/webhook")
  async setWebhook(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ISetWebhookBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.setWebhook(
      id,
      user.userId,
      body.url,
      body.secret,
    );

    return this._botService.toDetailDto(bot);
  }

  /** @summary Удалить webhook */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/webhook")
  async deleteWebhook(
    @Request() req: KoaRequest,
    @Path() id: UUID,
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
    @Path() id: UUID,
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
  async getCommands(@Path() id: UUID): Promise<BotCommandDto[]> {
    const commands = await this._botService.getCommands(id);

    return commands.map(BotCommandDto.fromEntity);
  }

  /**
   * Отправить ping на вебхук синхронно, без очереди и повторов. Попытка
   * пишется в журнал доставок.
   * @summary Тестировать webhook
   */
  @Security("jwt")
  @Post("{id}/webhook/test")
  async testWebhook(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<IWebhookTestResponse> {
    const user = getContextUser(req);
    const bot = await this._botService.getBotById(id, user.userId);

    return this._webhookService.testWebhook(bot);
  }

  /**
   * Журнал доставок вебхука: запись на каждую попытку, новые первыми.
   * @summary Логи доставки webhook
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{id}/webhook/logs")
  async getWebhookLogs(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<WebhookLogDto>> {
    const user = getContextUser(req);

    await this._botService.getBotById(id, user.userId);

    return this._webhookService.getLogs(id, offset, limit);
  }

  /** @summary Обновить фильтр событий webhook */
  @Security("jwt")
  @ValidateBody(SetWebhookEventsSchema)
  @Post("{id}/webhook/events")
  async setWebhookEvents(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ISetWebhookEventsBody,
  ): Promise<BotDetailDto> {
    const user = getContextUser(req);
    const bot = await this._botService.updateWebhookEvents(
      id,
      user.userId,
      body.events,
    );

    return this._botService.toDetailDto(bot);
  }

  /**
   * Добавить бота в группу участником. Доступно владельцу и админам чата.
   * @summary Добавить бота в чат
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Post("{id}/chats/{chatId}")
  async addBotToChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() chatId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._botService.addBotToChat(id, chatId, user.userId);
  }

  /**
   * Удалить бота из чата. Доступно владельцу и админам чата.
   * @summary Удалить бота из чата
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/chats/{chatId}")
  async removeBotFromChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() chatId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._botService.removeBotFromChat(id, chatId, user.userId);
  }
}
