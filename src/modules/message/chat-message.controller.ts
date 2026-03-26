import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { IMessageListDto, MessageDto } from "./dto";
import { MessageService } from "./message.service";
import { EMessageType } from "./message.types";
import { MarkReadSchema, SendMessageSchema } from "./validation";

interface ISendMessageBody {
  type?: EMessageType;
  content?: string;
  replyToId?: string;
  forwardedFromId?: string;
  fileIds?: string[];
}

interface IMarkReadBody {
  messageId: string;
}

@Injectable()
@Tags("Message")
@Route("api/chat")
export class ChatMessageController extends Controller {
  constructor(
    @inject(MessageService) private _messageService: MessageService,
  ) {
    super();
  }

  /**
   * Отправить сообщение в чат.
   * @summary Отправка сообщения
   */
  @Security("jwt")
  @ValidateBody(SendMessageSchema)
  @Post("{chatId}/message")
  sendMessage(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Body() body: ISendMessageBody,
  ): Promise<MessageDto> {
    const user = getContextUser(req);

    return this._messageService.sendMessage(chatId, user.userId, body);
  }

  /**
   * Получить сообщения чата с cursor-based пагинацией.
   * @summary Список сообщений
   * @param chatId ID чата
   * @param before ID сообщения для курсора (загрузить более старые)
   * @param limit Количество сообщений (по умолчанию 50)
   */
  @Security("jwt")
  @Get("{chatId}/message")
  getMessages(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Query() before?: string,
    @Query() limit?: number,
  ): Promise<IMessageListDto> {
    const user = getContextUser(req);

    return this._messageService.getMessages(
      chatId,
      user.userId,
      before,
      limit,
    );
  }

  /**
   * Отметить сообщения как прочитанные до указанного messageId.
   * @summary Прочитать сообщения
   */
  @Security("jwt")
  @ValidateBody(MarkReadSchema)
  @Post("{chatId}/message/read")
  async markAsRead(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Body() body: IMarkReadBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.markAsRead(
      chatId,
      user.userId,
      body.messageId,
    );
  }
}
