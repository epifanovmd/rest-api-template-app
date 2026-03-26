import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import { MessageDto } from "../message/dto/message.dto";
import { MessageService } from "../message/message.service";
import { EMessageType } from "../message/message.types";
import { BotService } from "./bot.service";

interface IBotSendMessageBody {
  chatId: string;
  content?: string;
  type?: EMessageType;
  replyToId?: string;
  fileIds?: string[];
}

interface IBotEditMessageBody {
  content: string;
}

@Injectable()
@Tags("Bot API")
@Route("api/bot-api")
export class BotApiController extends Controller {
  constructor(
    @inject(BotService) private _botService: BotService,
    @inject(MessageService) private _messageService: MessageService,
  ) {
    super();
  }

  /**
   * Отправить сообщение от имени бота.
   * @summary Bot: отправка сообщения
   */
  @Security("bot")
  @Post("message/send")
  async sendMessage(
    @Request() req: KoaRequest,
    @Body() body: IBotSendMessageBody,
  ): Promise<MessageDto> {
    const botToken = this._extractBotToken(req);
    const bot = await this._botService.getBotByToken(botToken);

    return this._messageService.sendMessage(body.chatId, bot.ownerId, {
      type: body.type,
      content: body.content,
      replyToId: body.replyToId,
      fileIds: body.fileIds,
    });
  }

  /**
   * Редактировать сообщение бота.
   * @summary Bot: редактирование сообщения
   */
  @Security("bot")
  @Post("message/{id}/edit")
  async editMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: IBotEditMessageBody,
  ): Promise<MessageDto> {
    const botToken = this._extractBotToken(req);
    const bot = await this._botService.getBotByToken(botToken);

    return this._messageService.editMessage(id, bot.ownerId, body.content);
  }

  /**
   * Удалить сообщение бота.
   * @summary Bot: удаление сообщения
   */
  @Security("bot")
  @Delete("message/{id}")
  async deleteMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const botToken = this._extractBotToken(req);
    const bot = await this._botService.getBotByToken(botToken);

    await this._messageService.deleteMessage(id, bot.ownerId);
  }

  private _extractBotToken(req: KoaRequest): string {
    const header = req.headers?.authorization;

    if (header?.startsWith("Bot ")) {
      return header.slice(4);
    }

    return (req.headers?.["x-bot-token"] as string) ?? "";
  }
}
