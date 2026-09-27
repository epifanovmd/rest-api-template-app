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
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { CallService } from "./call.service";
import { CallDto } from "./dto";
import { IInitiateCallBody } from "./dto/call-request.dto";
import { InitiateCallSchema } from "./validation";

@Injectable()
@Tags("Call")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/call")
export class CallController extends Controller {
  constructor(@inject(CallService) private _callService: CallService) {
    super();
  }

  /**
   * Инициировать звонок. Callee должен существовать и не быть в блокировке
   * с вызывающим; звонок привязывается к direct-чату пары, если он есть.
   * Без ответа в течение таймаута звонок становится MISSED.
   * @summary Начать звонок
   */
  @Security("jwt")
  @ValidateBody(InitiateCallSchema)
  @SuccessResponse(201, "Created")
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
  answerCall(@Request() req: KoaRequest, @Path() id: UUID): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.answerCall(id, user.userId);
  }

  /**
   * Отклонить звонок.
   * @summary Отклонить
   */
  @Security("jwt")
  @Post("{id}/decline")
  declineCall(@Request() req: KoaRequest, @Path() id: UUID): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.declineCall(id, user.userId);
  }

  /**
   * Завершить звонок. Отвеченный → ENDED с длительностью; ещё не отвеченный —
   * MISSED (завершил caller) или DECLINED (завершил callee).
   * @summary Завершить
   */
  @Security("jwt")
  @Post("{id}/end")
  endCall(@Request() req: KoaRequest, @Path() id: UUID): Promise<CallDto> {
    const user = getContextUser(req);

    return this._callService.endCall(id, user.userId);
  }

  /**
   * История звонков постранично (новые первыми).
   * @summary История звонков
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("history")
  getCallHistory(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<CallDto>> {
    const user = getContextUser(req);

    return this._callService.getCallHistory(user.userId, offset, limit);
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
