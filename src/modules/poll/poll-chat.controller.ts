import { inject } from "inversify";
import {
  Body,
  Controller,
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
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { PollDto } from "./dto";
import { ICreatePollBody } from "./dto/poll-request.dto";
import { PollService } from "./poll.service";
import { CreatePollSchema } from "./validation";

@Injectable()
@Tags("Poll")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/chat")
export class PollChatController extends Controller {
  constructor(@inject(PollService) private _pollService: PollService) {
    super();
  }

  /**
   * Создать опрос в чате. Создаётся как сообщение типа poll: те же права,
   * slow mode и блокировки, что у отправки сообщения.
   * @summary Создание опроса
   */
  @Security("jwt")
  @ValidateBody(CreatePollSchema)
  @SuccessResponse(201, "Created")
  @Post("{chatId}/poll")
  createPoll(
    @Request() req: KoaRequest,
    @Path() chatId: UUID,
    @Body() body: ICreatePollBody,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.createPoll(chatId, user.userId, body);
  }
}
