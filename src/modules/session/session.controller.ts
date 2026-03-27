import { inject } from "inversify";
import {
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

import { getContextUser, Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import { SessionDto } from "./session.dto";
import { SessionService } from "./session.service";

@Injectable()
@Tags("Session")
@Route("api/session")
export class SessionController extends Controller {
  constructor(
    @inject(SessionService) private _sessionService: SessionService,
  ) {
    super();
  }

  /**
   * Получить список активных сессий пользователя.
   * @summary Список сессий
   */
  @Security("jwt")
  @Get()
  getSessions(@Request() req: KoaRequest): Promise<SessionDto[]> {
    const user = getContextUser(req);

    return this._sessionService.getSessions(user.userId);
  }

  /**
   * Завершить конкретную сессию.
   * @summary Завершение сессии
   */
  @Security("jwt")
  @Delete("{id}")
  async terminateSession(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._sessionService.terminateSession(id, user.userId);
  }

  /**
   * Завершить все сессии, кроме текущей.
   * @summary Завершение остальных сессий
   */
  @Security("jwt")
  @Post("terminate-others")
  async terminateOtherSessions(@Request() req: KoaRequest): Promise<void> {
    const user = getContextUser(req);

    await this._sessionService.terminateAllOther(user.userId, user.sessionId);
  }
}
