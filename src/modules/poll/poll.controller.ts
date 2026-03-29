import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
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
import { IVotePollBody } from "./dto/poll-request.dto";
import { PollService } from "./poll.service";
import { VotePollSchema } from "./validation";

@Injectable()
@Tags("Poll")
@Route("api/poll")
export class PollController extends Controller {
  constructor(@inject(PollService) private _pollService: PollService) {
    super();
  }

  /**
   * Проголосовать в опросе.
   * @summary Голосование
   */
  @Security("jwt")
  @ValidateBody(VotePollSchema)
  @Post("{id}/vote")
  vote(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: IVotePollBody,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.vote(id, user.userId, body.optionIds);
  }

  /**
   * Отозвать голос.
   * @summary Отзыв голоса
   */
  @Security("jwt")
  @Delete("{id}/vote")
  retractVote(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.retractVote(id, user.userId);
  }

  /**
   * Закрыть опрос.
   * @summary Закрытие опроса
   */
  @Security("jwt")
  @Post("{id}/close")
  closePoll(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.closePoll(id, user.userId);
  }

  /**
   * Получить опрос по ID.
   * @summary Получение опроса
   */
  @Security("jwt")
  @Get("{id}")
  getPoll(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.getPollById(id, user.userId);
  }
}
