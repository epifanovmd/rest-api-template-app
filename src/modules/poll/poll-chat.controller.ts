import { inject } from "inversify";
import {
  Body,
  Controller,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { PollDto } from "./dto";
import { PollService } from "./poll.service";
import { CreatePollSchema } from "./validation";

interface ICreatePollBody {
  question: string;
  options: string[];
  isAnonymous?: boolean;
  isMultipleChoice?: boolean;
}

@Injectable()
@Tags("Poll")
@Route("api/chat")
export class PollChatController extends Controller {
  constructor(@inject(PollService) private _pollService: PollService) {
    super();
  }

  /**
   * Создать опрос в чате.
   * @summary Создание опроса
   */
  @Security("jwt")
  @ValidateBody(CreatePollSchema)
  @Post("{chatId}/poll")
  createPoll(
    @Request() req: KoaRequest,
    @Path() chatId: string,
    @Body() body: ICreatePollBody,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.createPoll(chatId, user.userId, body);
  }
}
