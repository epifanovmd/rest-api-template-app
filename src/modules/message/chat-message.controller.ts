import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
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
import {
  IMediaGalleryDto,
  IMediaStatsDto,
  IMessageListDto,
  IMessageSearchDto,
  MessageDto,
} from "./dto";
import { MessageService } from "./message.service";
import { EMessageType } from "./message.types";
import { MarkReadSchema, SendMessageSchema } from "./validation";

interface ISendMessageBody {
  type?: EMessageType;
  content?: string;
  replyToId?: string;
  forwardedFromId?: string;
  fileIds?: string[];
  mentionedUserIds?: string[];
  mentionAll?: boolean;
  encryptedContent?: string;
  encryptionMetadata?: Record<string, unknown>;
  scheduledAt?: string;
  selfDestructSeconds?: number;
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
   * Поиск сообщений в чате.
   * @summary Поиск в чате
   */
  @Security("jwt")
  @Get("{chatId}/message/search")
  async searchMessages(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Query() q: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IMessageSearchDto> {
    const user = getContextUser(req);

    return this._messageService.searchMessages(
      chatId,
      user.userId,
      q,
      limit,
      offset,
    );
  }

  /**
   * Получить закреплённые сообщения чата.
   * @summary Закреплённые сообщения
   */
  @Security("jwt")
  @Get("{chatId}/message/pinned")
  getPinnedMessages(
    @Request() req: KoaRequest,
    @Path() chatId: string,
  ): Promise<MessageDto[]> {
    const user = getContextUser(req);

    return this._messageService.getPinnedMessages(chatId, user.userId);
  }

  /**
   * Получить медиафайлы чата.
   * @summary Медиа-галерея чата
   * @param chatId ID чата
   * @param type Фильтр по MIME-префиксу (image, video, audio)
   * @param limit Количество (по умолчанию 50)
   * @param offset Смещение
   */
  @Security("jwt")
  @Get("{chatId}/media")
  getChatMedia(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Query() type?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IMediaGalleryDto> {
    const user = getContextUser(req);

    return this._messageService.getChatMedia(
      chatId,
      user.userId,
      type,
      limit,
      offset,
    );
  }

  /**
   * Получить статистику медиафайлов чата.
   * @summary Статистика медиа
   */
  @Security("jwt")
  @Get("{chatId}/media/stats")
  getChatMediaStats(
    @Request() req: KoaRequest,
    @Path() chatId: string,
  ): Promise<IMediaStatsDto> {
    const user = getContextUser(req);

    return this._messageService.getChatMediaStats(chatId, user.userId);
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

  /**
   * Получить запланированные сообщения чата.
   * @summary Запланированные сообщения
   */
  @Security("jwt")
  @Get("{chatId}/message/scheduled")
  getScheduledMessages(
    @Request() req: KoaRequest,
    @Path() chatId: string,
  ): Promise<MessageDto[]> {
    const user = getContextUser(req);

    return this._messageService.getScheduledMessages(chatId, user.userId);
  }

  /**
   * Отменить запланированное сообщение.
   * @summary Отмена запланированного сообщения
   */
  @Security("jwt")
  @Delete("{chatId}/message/scheduled/{messageId}")
  async cancelScheduledMessage(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Path() messageId: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.cancelScheduledMessage(messageId, user.userId);
  }
}
