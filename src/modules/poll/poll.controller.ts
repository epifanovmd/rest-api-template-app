import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { PollDto } from "./dto";
import { IVotePollBody } from "./dto/poll-request.dto";
import { PollService } from "./poll.service";
import { VotePollSchema } from "./validation";

@Injectable()
@Tags("Poll")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/poll")
export class PollController extends Controller {
  constructor(@inject(PollService) private _pollService: PollService) {
    super();
  }

  /**
   * Проголосовать в опросе. Закрытый опрос или удалённое сообщение — 400;
   * повторяющиеся optionIds схлопываются.
   * @summary Голосование
   */
  @Security("jwt")
  @ValidateBody(VotePollSchema)
  @Post("{id}/vote")
  vote(
    @Request() req: KoaRequest,
    @Path() id: UUID,
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
  retractVote(@Request() req: KoaRequest, @Path() id: UUID): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.retractVote(id, user.userId);
  }

  /**
   * Закрыть опрос. Доступно автору и ADMIN/OWNER чата.
   * @summary Закрытие опроса
   */
  @Security("jwt")
  @Post("{id}/close")
  closePoll(@Request() req: KoaRequest, @Path() id: UUID): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.closePoll(id, user.userId);
  }

  /**
   * Получить опрос по ID (только участникам чата).
   * @summary Получение опроса
   */
  @Security("jwt")
  @Get("{id}")
  getPoll(@Request() req: KoaRequest, @Path() id: UUID): Promise<PollDto> {
    const user = getContextUser(req);

    return this._pollService.getPollById(id, user.userId);
  }
}
