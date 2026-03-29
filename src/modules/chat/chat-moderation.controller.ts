import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { ChatModerationService } from "./chat-moderation.service";
import { IBanMemberBody, IBannedMemberDto, ISetSlowModeBody } from "./dto/chat-moderation-request.dto";
import { BanMemberSchema, SetSlowModeSchema } from "./validation/moderation.validate";

@Injectable()
@Tags("Chat Moderation")
@Route("api/chat")
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
    @Path() id: string,
    @Body() body: ISetSlowModeBody,
  ): Promise<{ chatId: string; slowModeSeconds: number }> {
    const user = getContextUser(req);

    return this._moderationService.setSlowMode(id, user.userId, body.seconds);
  }

  /**
   * Заблокировать участника чата.
   * @summary Блокировка участника
   */
  @Security("jwt")
  @ValidateBody(BanMemberSchema)
  @Post("{id}/members/{userId}/ban")
  async banMember(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Path() userId: string,
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
   * Разблокировать участника чата.
   * @summary Разблокировка участника
   */
  @Security("jwt")
  @Delete("{id}/members/{userId}/ban")
  async unbanMember(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Path() userId: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._moderationService.unbanMember(id, user.userId, userId);
  }

  /**
   * Получить заблокированных участников.
   * @summary Заблокированные участники
   */
  @Security("jwt")
  @Get("{id}/members/banned")
  getBannedMembers(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<IBannedMemberDto[]> {
    const user = getContextUser(req);

    return this._moderationService.getBannedMembers(id, user.userId);
  }
}
