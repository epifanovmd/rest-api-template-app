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
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { IMessageSearchDto, MessageDto } from "./dto";
import { MessageService } from "./message.service";
import { AddReactionSchema, EditMessageSchema } from "./validation";

interface IEditMessageBody {
  content: string;
}

interface IAddReactionBody {
  emoji: string;
}

@Injectable()
@Tags("Message")
@Route("api/message")
export class MessageController extends Controller {
  constructor(
    @inject(MessageService) private _messageService: MessageService,
  ) {
    super();
  }

  /**
   * Глобальный поиск по сообщениям во всех чатах пользователя.
   * @summary Глобальный поиск сообщений
   */
  @Security("jwt")
  @Get("search")
  async searchMessages(
    @Request() req: KoaRequest,
    @Query() q: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IMessageSearchDto> {
    const user = getContextUser(req);

    return this._messageService.searchGlobalMessages(
      user.userId,
      q,
      limit,
      offset,
    );
  }

  /**
   * Отредактировать сообщение.
   * @summary Редактирование сообщения
   */
  @Security("jwt")
  @ValidateBody(EditMessageSchema)
  @Patch("{id}")
  editMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
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
  @Post("{id}/reaction")
  async addReaction(
    @Request() req: KoaRequest,
    @Path() id: string,
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
  @Delete("{id}/reaction")
  async removeReaction(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.removeReaction(id, user.userId);
  }

  /**
   * Закрепить сообщение.
   * @summary Закрепление сообщения
   */
  @Security("jwt")
  @Post("{id}/pin")
  pinMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<MessageDto> {
    const user = getContextUser(req);

    return this._messageService.pinMessage(id, user.userId);
  }

  /**
   * Открепить сообщение.
   * @summary Открепление сообщения
   */
  @Security("jwt")
  @Delete("{id}/pin")
  async unpinMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.unpinMessage(id, user.userId);
  }

  /**
   * Удалить сообщение (soft delete).
   * @summary Удаление сообщения
   */
  @Security("jwt")
  @Delete("{id}")
  async deleteMessage(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._messageService.deleteMessage(id, user.userId);
  }

}
