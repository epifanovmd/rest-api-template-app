import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
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
import {
  getContextUser,
  Injectable,
  ValidateBody,
  ValidateQuery,
} from "../../core";
import { HttpException, UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import {
  IMarkReadBody,
  IMediaStatsDto,
  IMessagePageDto,
  ISendMessageBody,
  MediaItemDto,
  MessageDto,
} from "./dto";
import { MessageError } from "./message.errors";
import { MessageService } from "./message.service";
import {
  GetMessagesQuerySchema,
  MarkReadSchema,
  SendMessageSchema,
} from "./validation";

@Injectable()
@Tags("Message")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/chat")
export class ChatMessageController extends Controller {
  constructor(@inject(MessageService) private _messageService: MessageService) {
    super();
  }

  /**
   * Отправить сообщение в чат.
   * - `replyToId` — только сообщение этого же чата;
   * - `forwardedFromId` — сообщение из чата, где отправитель состоит;
   * - `fileIds` — свои загруженные файлы, ещё не прикреплённые к сообщениям;
   * - в личном чате с блокировкой — 403;
   * - slow mode — 429 `MESSAGE_SLOW_MODE` с заголовком `Retry-After`
   *   (ADMIN/OWNER не ограничены).
   * @summary Отправка сообщения
   */
  @Security("jwt")
  @ValidateBody(SendMessageSchema)
  @SuccessResponse(201, "Created")
  @Post("{chatId}/message")
  async sendMessage(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Body() body: ISendMessageBody,
  ): Promise<MessageDto> {
    const user = getContextUser(req);

    try {
      return await this._messageService.sendMessage(chatId, user.userId, body);
    } catch (err) {
      if (
        err instanceof HttpException &&
        err.code === MessageError.codes.SLOW_MODE
      ) {
        const { retryAfter } = (err.reason ?? {}) as { retryAfter?: number };

        if (typeof retryAfter === "number") {
          req.ctx.set("Retry-After", String(retryAfter));
        }
      }

      throw err;
    }
  }

  /**
   * История сообщений чата, от новых к старым, курсорами.
   * - без параметров — последние сообщения;
   * - `cursor` — `nextCursor` (более старые) или `prevCursor` (более новые)
   *   из предыдущей страницы;
   * - `around` — окно вокруг сообщения (переход к сообщению), с курсорами
   *   в обе стороны; вместе с `cursor` не передаётся.
   * @summary Список сообщений
   * @param chatId ID чата
   * @param cursor Курсор из предыдущей страницы
   * @param around ID сообщения — окно вокруг него
   * @param limit Размер страницы (по умолчанию 50, максимум 100)
   */
  @Security("jwt")
  @ValidateQuery(GetMessagesQuerySchema)
  @Get("{chatId}/message")
  getMessages(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Query() cursor?: string,
    @Query() around?: string,
    @Query() limit?: number,
  ): Promise<IMessagePageDto> {
    const user = getContextUser(req);

    return this._messageService.getMessages(chatId, user.userId, {
      cursor,
      around,
      limit,
    });
  }

  /**
   * Поиск сообщений в чате. Запрос — минимум 2 символа; `%` и `_` ищутся буквально.
   * @summary Поиск в чате
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{chatId}/message/search")
  searchChatMessages(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Query() q: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    const user = getContextUser(req);

    return this._messageService.searchMessages(
      chatId,
      user.userId,
      q,
      offset,
      limit,
    );
  }

  /**
   * Закреплённые сообщения чата постранично (последние закреплённые первыми).
   * @summary Закреплённые сообщения
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{chatId}/message/pinned")
  getPinnedMessages(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    const user = getContextUser(req);

    return this._messageService.getPinnedMessages(
      chatId,
      user.userId,
      offset,
      limit,
    );
  }

  /**
   * Медиафайлы чата постранично.
   * @summary Медиа-галерея чата
   * @param chatId ID чата
   * @param type Фильтр: MIME-префикс (image, video, audio) или document
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{chatId}/media")
  getChatMedia(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Query() type?: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<MediaItemDto>> {
    const user = getContextUser(req);

    return this._messageService.getChatMedia(
      chatId,
      user.userId,
      type,
      offset,
      limit,
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
    @Path() chatId: UUID,
  ): Promise<IMediaStatsDto> {
    const user = getContextUser(req);

    return this._messageService.getChatMediaStats(chatId, user.userId);
  }

  /**
   * Отметить сообщения как прочитанные.
   * @summary Прочитать сообщения
   */
  @Security("jwt")
  @ValidateBody(MarkReadSchema)
  @SuccessResponse(204, "No Content")
  @Post("{chatId}/message/read")
  async markAsRead(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Body() body: IMarkReadBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.markAsRead(chatId, user.userId, body.messageIds);
  }
}
