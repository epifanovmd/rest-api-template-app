import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Patch,
  Path,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { MessageDto } from "./dto";
import { MessageService } from "./message.service";
import { EditMessageSchema } from "./validation";

interface IEditMessageBody {
  content: string;
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
