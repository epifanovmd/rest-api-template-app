import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Patch,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { MessageDto } from "../message";
import { Bot } from "./bot.entity";
import { BotService } from "./bot.service";
import {
  IBotEditMessageBody,
  IBotSendMessageBody,
} from "./dto/bot-request.dto";
import { BotEditMessageSchema, BotSendMessageSchema } from "./validation";

/**
 * API для ботов: `Authorization: Bot <token>` (или `X-Bot-Token`).
 * Бот действует от своего технического пользователя и только в чатах,
 * куда его явно добавили.
 */
@Injectable()
@Tags("Bot API")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/bot-api")
export class BotApiController extends Controller {
  constructor(@inject(BotService) private _botService: BotService) {
    super();
  }

  /**
   * Отправить текстовое сообщение от имени бота. Бот должен быть участником чата.
   * @summary Bot: отправка сообщения
   */
  @Security("bot")
  @ValidateBody(BotSendMessageSchema)
  @SuccessResponse(201, "Created")
  @Post("message")
  async botSendMessage(
    @Request() req: KoaRequest,
    @Body() body: IBotSendMessageBody,
  ): Promise<MessageDto> {
    const bot = await this._resolveBot(req);

    return this._botService.sendMessage(bot, body);
  }

  /**
   * Редактировать сообщение бота.
   * @summary Bot: редактирование сообщения
   */
  @Security("bot")
  @ValidateBody(BotEditMessageSchema)
  @Patch("message/{id}")
  async botEditMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IBotEditMessageBody,
  ): Promise<MessageDto> {
    const bot = await this._resolveBot(req);

    return this._botService.editMessage(bot, id, body.content);
  }

  /**
   * Удалить сообщение бота для всех.
   * @summary Bot: удаление сообщения
   */
  @Security("bot")
  @SuccessResponse(204, "No Content")
  @Delete("message/{id}")
  async botDeleteMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const bot = await this._resolveBot(req);

    await this._botService.deleteMessage(bot, id);
  }

  /** Бот по токену запроса; неверный или отключённый → 401. */
  private _resolveBot(req: KoaRequest): Promise<Bot> {
    const header = req.headers?.authorization;
    const token = header?.startsWith("Bot ")
      ? header.slice(4)
      : ((req.headers?.["x-bot-token"] as string | undefined) ?? "");

    return this._botService.getBotByToken(token);
  }
}
