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
import { ChatModerationService } from "./chat-moderation.service";
import {
  IBanMemberBody,
  IBannedMemberDto,
  ISetSlowModeBody,
} from "./dto/chat-moderation-request.dto";
import {
  BanMemberSchema,
  SetSlowModeSchema,
} from "./validation/moderation.validate";

@Injectable()
@Tags("Chat Moderation")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/chat")
export class ChatModerationController extends Controller {
  constructor(
    @inject(ChatModerationService)
    private _moderationService: ChatModerationService,
  ) {
    super();
  }

  /**
   * Установить режим медленной отправки.
   * @summary Медленный режим
   */
  @Security("jwt")
  @ValidateBody(SetSlowModeSchema)
  @Patch("{id}/slow-mode")
  setSlowMode(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ISetSlowModeBody,
  ): Promise<{ chatId: string; slowModeSeconds: number }> {
    const user = getContextUser(req);

    return this._moderationService.setSlowMode(id, user.userId, body.seconds);
  }

  /**
   * Забанить участника: он исключается из чата и не может вернуться (инвайт,
   * подписка, добавление) до снятия бана или истечения `duration` секунд.
   * Без `duration` — бессрочно. Администратор банит только участников и
   * подписчиков, владелец — также администраторов.
   * @summary Блокировка участника
   */
  @Security("jwt")
  @ValidateBody(BanMemberSchema)
  @SuccessResponse(204, "No Content")
  @Post("{id}/members/{userId}/ban")
  async banMember(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
    @Body() body: IBanMemberBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._moderationService.banMember(
      id,
      user.userId,
      userId,
      body.duration,
      body.reason,
    );
  }

  /**
   * Снять бан. Пользователь не возвращается в чат автоматически.
   * @summary Разблокировка участника
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/members/{userId}/ban")
  async unbanMember(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._moderationService.unbanMember(id, user.userId, userId);
  }

  /**
   * Действующие баны чата постранично (истёкшие не возвращаются).
   * @summary Заблокированные участники
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{id}/members/banned")
  getBannedMembers(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<IBannedMemberDto>> {
    const user = getContextUser(req);

    return this._moderationService.getBannedMembers(
      id,
      user.userId,
      offset,
      limit,
    );
  }
}
