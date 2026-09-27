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
import {
  IAddReactionBody,
  IEditMessageBody,
  MessageDto,
  MessageReceiptDto,
} from "./dto";
import { MessageService } from "./message.service";
import { AddReactionSchema, EditMessageSchema } from "./validation";

@Injectable()
@Tags("Message")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/message")
export class MessageController extends Controller {
  constructor(@inject(MessageService) private _messageService: MessageService) {
    super();
  }

  /**
   * Глобальный поиск по сообщениям во всех чатах пользователя.
   * Запрос — минимум 2 символа; `%` и `_` ищутся буквально.
   * @summary Глобальный поиск сообщений
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("search")
  searchMessages(
    @Request() req: KoaRequest,
    @Query() q: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    const user = getContextUser(req);

    return this._messageService.searchGlobalMessages(
      user.userId,
      q,
      offset,
      limit,
    );
  }

  /**
   * Отредактировать своё текстовое сообщение (нужно быть участником чата).
   * @summary Редактирование сообщения
   */
  @Security("jwt")
  @ValidateBody(EditMessageSchema)
  @Patch("{id}")
  editMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IEditMessageBody,
  ): Promise<MessageDto> {
    const user = getContextUser(req);

    return this._messageService.editMessage(id, user.userId, body.content);
  }

  /**
   * Добавить реакцию на сообщение.
   * @summary Добавление реакции
   */
  @Security("jwt")
  @ValidateBody(AddReactionSchema)
  @SuccessResponse(204, "No Content")
  @Post("{id}/reaction")
  async addReaction(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IAddReactionBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.addReaction(id, user.userId, body.emoji);
  }

  /**
   * Удалить реакцию с сообщения.
   * @summary Удаление реакции
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/reaction")
  async removeReaction(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.removeReaction(id, user.userId);
  }

  /**
   * Закрепить сообщение. В группе и канале — только ADMIN/OWNER,
   * в личном чате — любой участник.
   * @summary Закрепление сообщения
   */
  @Security("jwt")
  @Post("{id}/pin")
  pinMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<MessageDto> {
    const user = getContextUser(req);

    return this._messageService.pinMessage(id, user.userId);
  }

  /**
   * Открепить сообщение. Права — как у закрепления.
   * @summary Открепление сообщения
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/pin")
  async unpinMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.unpinMessage(id, user.userId);
  }

  /**
   * Получить информацию о прочтении сообщения (кто прочитал, кто получил).
   * Доступно для участников чата.
   * @summary Информация о прочтении сообщения
   */
  @Security("jwt")
  @Get("{id}/receipts")
  async getReceiptInfo(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<MessageReceiptDto[]> {
    const user = getContextUser(req);

    return this._messageService.getReceiptInfo(id, user.userId);
  }

  /**
   * Удалить сообщение. forAll=true — для всех (автор или ADMIN/OWNER;
   * повторно — 400; опрос при этом закрывается), forAll=false — только для себя.
   * @summary Удаление сообщения
   * @param id ID сообщения
   * @param forAll Удалить для всех (по умолчанию false — только для себя)
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteMessage(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() forAll?: boolean,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.deleteMessage(id, user.userId, forAll ?? false);
  }
}
