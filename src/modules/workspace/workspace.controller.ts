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
import {
  getContextUser,
  Injectable,
  normalizePagination,
  ValidateBody,
} from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import {
  IChangeWorkspaceMemberRoleBody,
  ICreateWorkspaceBody,
  ITransferWorkspaceOwnershipBody,
  IUpdateWorkspaceBody,
  WorkspaceDto,
  WorkspaceMemberDto,
} from "./dto";
import {
  ChangeWorkspaceMemberRoleSchema,
  CreateWorkspaceSchema,
  TransferWorkspaceOwnershipSchema,
  UpdateWorkspaceSchema,
} from "./validation";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceMemberService } from "./workspace-member.service";

@Injectable()
@Tags("Workspace")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/workspaces")
export class WorkspaceController extends Controller {
  constructor(
    @inject(WorkspaceService) private readonly _workspaces: WorkspaceService,
    @inject(WorkspaceMemberService)
    private readonly _members: WorkspaceMemberService,
  ) {
    super();
  }

  /**
   * Создать рабочее пространство. Создатель становится владельцем. Без
   * `slug` адрес генерируется из названия. Занятый `slug` — 409.
   * @summary Создание пространства
   */
  @Security("jwt")
  @ValidateBody(CreateWorkspaceSchema)
  @SuccessResponse(201, "Created")
  @Post()
  createWorkspace(
    @Request() req: KoaRequest,
    @Body() body: ICreateWorkspaceBody,
  ): Promise<WorkspaceDto> {
    return this._workspaces.create(getContextUser(req).userId, body);
  }

  /**
   * Пространства текущего пользователя с его ролью. Архивные — только при
   * `includeArchived=true`.
   * @summary Мои пространства
   */
  @Security("jwt")
  @Get()
  listWorkspaces(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
    @Query() includeArchived?: boolean,
  ): Promise<IPaginatedDto<WorkspaceDto>> {
    return this._workspaces.listForUser(
      getContextUser(req).userId,
      normalizePagination(offset, limit),
      includeArchived ?? false,
    );
  }

  /**
   * Пространство по id. Не участник получает 404 — существование не
   * раскрывается.
   * @summary Пространство
   */
  @Security("jwt")
  @Get("{id}")
  getWorkspace(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<WorkspaceDto> {
    return this._workspaces.get(getContextUser(req), id);
  }

  /**
   * Изменить название, адрес или архивировать — admin и выше.
   * @summary Изменение пространства
   */
  @Security("jwt")
  @ValidateBody(UpdateWorkspaceSchema)
  @Patch("{id}")
  updateWorkspace(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUpdateWorkspaceBody,
  ): Promise<WorkspaceDto> {
    return this._workspaces.update(getContextUser(req), id, body);
  }

  /**
   * Удалить пространство со всеми участниками и приглашениями — только
   * владелец.
   * @summary Удаление пространства
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteWorkspace(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    await this._workspaces.delete(getContextUser(req), id);
  }

  /**
   * Передать владение участнику. Прежний владелец становится admin.
   * @summary Передача владения
   */
  @Security("jwt")
  @ValidateBody(TransferWorkspaceOwnershipSchema)
  @Post("{id}/transfer-ownership")
  transferOwnership(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ITransferWorkspaceOwnershipBody,
  ): Promise<WorkspaceDto> {
    return this._workspaces.transferOwnership(
      getContextUser(req),
      id,
      body.userId,
    );
  }

  /**
   * Участники пространства — старшие по времени вступления первыми.
   * @summary Участники
   */
  @Security("jwt")
  @Get("{id}/members")
  listMembers(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<WorkspaceMemberDto>> {
    return this._members.list(
      getContextUser(req),
      id,
      normalizePagination(offset, limit),
    );
  }

  /**
   * Сменить роль участника — admin и выше. Роль не выше своей; владельца
   * и участников старше себя менять нельзя; owner — через передачу.
   * @summary Смена роли участника
   */
  @Security("jwt")
  @ValidateBody(ChangeWorkspaceMemberRoleSchema)
  @Patch("{id}/members/{userId}")
  changeMemberRole(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
    @Body() body: IChangeWorkspaceMemberRoleBody,
  ): Promise<WorkspaceMemberDto> {
    return this._members.changeRole(getContextUser(req), id, userId, body.role);
  }

  /**
   * Удалить участника — admin и выше; себя — то же, что выход.
   * @summary Удаление участника
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/members/{userId}")
  async removeMember(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
  ): Promise<void> {
    await this._members.remove(getContextUser(req), id, userId);
  }

  /**
   * Выйти из пространства. Владелец сначала передаёт владение (409).
   * @summary Выход из пространства
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Post("{id}/leave")
  async leaveWorkspace(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    await this._members.leave(getContextUser(req).userId, id);
  }
}
