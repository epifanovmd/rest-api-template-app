import type { Context, Next } from "koa";
import { Middlewares } from "tsoa";

import { iocContainer } from "../../app.container";
import {
  InternalServerErrorException,
  UnauthorizedException,
} from "../../core";
import type { AuthContext, KoaRequest } from "../../types/koa";
import { WorkspaceError } from "./workspace.errors";
import type { IWorkspaceMembership, TWorkspaceRole } from "./workspace.types";
import { WorkspaceAccessService } from "./workspace-access.service";

export interface IWorkspaceRoleOptions {
  /** Имя path-параметра с id пространства (по умолчанию `workspaceId`). */
  param?: string;
}

type TAccessResolver = () => Pick<WorkspaceAccessService, "require">;

/** Сервис из контейнера: middleware tsoa создаётся без DI. */
const resolveAccess: TAccessResolver = () =>
  iocContainer.get(WorkspaceAccessService);

/**
 * Middleware проверки роли. Работает после `@Security`: берёт пользователя
 * из запроса, id — из `ctx.params[param]`, членство кладёт в
 * `ctx.state.workspaceMember`.
 */
export const createWorkspaceRoleMiddleware =
  (
    minRole: TWorkspaceRole,
    options: IWorkspaceRoleOptions = {},
    getAccess: TAccessResolver = resolveAccess,
  ) =>
  async (ctx: Context, next: Next): Promise<void> => {
    const user = (ctx.request as { user?: AuthContext }).user;

    if (!user) throw new UnauthorizedException();

    const workspaceId = ctx.params?.[options.param ?? "workspaceId"];

    if (typeof workspaceId !== "string" || !workspaceId) {
      throw WorkspaceError.NOT_FOUND();
    }

    ctx.state.workspaceMember = await getAccess().require(
      user,
      workspaceId,
      minRole,
    );

    await next();
  };

/**
 * Требует роль в пространстве из пути. Ставится вместе с `@Security("jwt")`.
 *
 * @example
 * \@Security("jwt")
 * \@WorkspaceRole("editor", { param: "workspaceId" })
 * \@Post("{workspaceId}/documents")
 * create(@Request() req: KoaRequest, @Path() workspaceId: UUID) {
 *   const member = getWorkspaceMember(req);
 * }
 */
export const WorkspaceRole = (
  minRole: TWorkspaceRole,
  options: IWorkspaceRoleOptions = {},
): MethodDecorator & ClassDecorator =>
  Middlewares(createWorkspaceRoleMiddleware(minRole, options));

/** Членство, проверенное `@WorkspaceRole`; без декоратора — 500. */
export const getWorkspaceMember = (req: KoaRequest): IWorkspaceMembership => {
  const member = req.ctx.state?.workspaceMember as
    IWorkspaceMembership | undefined;

  if (!member) {
    throw new InternalServerErrorException(
      "Маршрут без @WorkspaceRole: членство в пространстве не проверено",
    );
  }

  return member;
};
