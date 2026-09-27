import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
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
import {
  getContextUser,
  Injectable,
  normalizePagination,
  ValidateBody,
} from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import {
  IAcceptWorkspaceInviteBody,
  ICreateWorkspaceInviteBody,
  WorkspaceDto,
  WorkspaceInviteDto,
} from "./dto";
import {
  AcceptWorkspaceInviteSchema,
  CreateWorkspaceInviteSchema,
} from "./validation";
import { WorkspaceInviteService } from "./workspace-invite.service";

@Injectable()
@Tags("WorkspaceInvite")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/workspaces")
export class WorkspaceInviteController extends Controller {
  constructor(
    @inject(WorkspaceInviteService)
    private readonly _invites: WorkspaceInviteService,
  ) {
    super();
  }

  /**
   * Принять приглашение по токену из письма. Email приглашения должен
   * совпасть с подтверждённым email пользователя
   * (`WORKSPACE_INVITE_EMAIL_MISMATCH`).
   * @summary Принятие приглашения
   */
  @Security("jwt")
  @ValidateBody(AcceptWorkspaceInviteSchema)
  @Post("invites/accept")
  acceptInvite(
    @Request() req: KoaRequest,
    @Body() body: IAcceptWorkspaceInviteBody,
  ): Promise<WorkspaceDto> {
    return this._invites.accept(getContextUser(req), body.token);
  }

  /**
   * Пригласить по email — admin и выше, роль не выше своей. Ссылка с
   * токеном уходит только в письме. Прежнее действующее приглашение на этот
   * email отзывается.
   * @summary Приглашение участника
   */
  @Security("jwt")
  @ValidateBody(CreateWorkspaceInviteSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/invites")
  createInvite(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ICreateWorkspaceInviteBody,
  ): Promise<WorkspaceInviteDto> {
    return this._invites.create(getContextUser(req), id, body);
  }

  /**
   * Приглашения пространства во всех состояниях — admin и выше.
   * @summary Приглашения
   */
  @Security("jwt")
  @Get("{id}/invites")
  listInvites(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<WorkspaceInviteDto>> {
    return this._invites.list(
      getContextUser(req),
      id,
      normalizePagination(offset, limit),
    );
  }

  /**
   * Отозвать приглашение — admin и выше. Принятое отозвать нельзя (409).
   * @summary Отзыв приглашения
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/invites/{inviteId}")
  async revokeInvite(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() inviteId: UUID,
  ): Promise<void> {
    await this._invites.revoke(getContextUser(req), id, inviteId);
  }
}
