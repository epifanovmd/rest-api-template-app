import { inject } from "inversify";
import {
  Body,
  Controller,
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
import { CallService } from "./call.service";
import { CallDto, ICallHistoryDto } from "./dto";
import { IInitiateCallBody } from "./dto/call-request.dto";
import { InitiateCallSchema } from "./validation";

@Injectable()
@Tags("Call")
@Route("api/call")
export class CallController extends Controller {
  constructor(@inject(CallService) private _callService: CallService) {
    super();
  }

  /**
   * Инициировать звонок.
   * @summary Начать звонок
   */
  @Security("jwt")
  @ValidateBody(InitiateCallSchema)
  @Post()
  initiateCall(
    @Request() req: KoaRequest,
    @Body() body: IInitiateCallBody,
  ): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.initiateCall(user.userId, body);
  }

  /**
   * Ответить на звонок.
   * @summary Ответить
   */
  @Security("jwt")
  @Post("{id}/answer")
  answerCall(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.answerCall(id, user.userId);
  }

  /**
   * Отклонить звонок.
   * @summary Отклонить
   */
  @Security("jwt")
  @Post("{id}/decline")
  declineCall(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.declineCall(id, user.userId);
  }

  /**
   * Завершить звонок.
   * @summary Завершить
   */
  @Security("jwt")
  @Post("{id}/end")
  endCall(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.endCall(id, user.userId);
  }

  /**
   * Получить историю звонков.
   * @summary История звонков
   */
  @Security("jwt")
  @Get("history")
  getCallHistory(
    @Request() req: KoaRequest,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<ICallHistoryDto> {
    const user = getContextUser(req);

    return this._callService.getCallHistory(user.userId, limit, offset);
  }

  /**
   * Получить активный звонок.
   * @summary Активный звонок
   */
  @Security("jwt")
  @Get("active")
  getActiveCall(@Request() req: KoaRequest): Promise<CallDto | null> {
    const user = getContextUser(req);

    return this._callService.getActiveCall(user.userId);
  }
}
