import { inject } from "inversify";

import { isUuid } from "../../common";
import { Injectable, isSuperUser } from "../../core";
import type { AuthContext } from "../../types/koa";
import { WorkspaceError } from "./workspace.errors";
import { WorkspaceRepository } from "./workspace.repository";
import {
  type IWorkspaceMembership,
  type TWorkspaceRole,
  workspaceRoleCovers,
  WorkspaceRoles,
} from "./workspace.types";
import { WorkspaceMemberRepository } from "./workspace-member.repository";
import { WorkspaceRoleCache } from "./workspace-role.cache";

/**
 * Кто проверяется: контекст запроса (учитывается суперпользователь) или
 * просто id (сокет, задачи — только членство).
 */
export type TWorkspaceActor = AuthContext | string;

const actorUserId = (actor: TWorkspaceActor): string =>
  typeof actor === "string" ? actor : actor.userId;

const isSuperActor = (actor: TWorkspaceActor): boolean =>
  typeof actor !== "string" && isSuperUser(actor);

/**
 * Доступ к пространству. Роль читается из кэша (Redis или память, TTL 30 с),
 * при промахе — из БД. Изменения членства обязаны вызвать `invalidate`.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(
    @inject(WorkspaceMemberRepository)
    private readonly _members: WorkspaceMemberRepository,
    @inject(WorkspaceRepository)
    private readonly _workspaces: WorkspaceRepository,
    @inject(WorkspaceRoleCache) private readonly _cache: WorkspaceRoleCache,
  ) {}

  /** Роль пользователя по членству; `null` — не участник или нет пространства. */
  async roleOf(
    userId: string,
    workspaceId: string,
  ): Promise<TWorkspaceRole | null> {
    if (!isUuid(workspaceId)) return null;

    const cached = await this._cache.get(workspaceId, userId);

    if (cached !== undefined) return cached;

    const membership = await this._members.findMembership(workspaceId, userId);
    const role = membership?.role ?? null;

    await this._cache.set(workspaceId, userId, role);

    return role;
  }

  /**
   * Проверить доступ и вернуть членство. Не участник и несуществующее
   * пространство неразличимы — оба `WORKSPACE_NOT_FOUND`; роли не хватает —
   * `WORKSPACE_FORBIDDEN`. Суперпользователь (роль admin или право `*`)
   * проходит без членства с ролью owner.
   */
  async require(
    actor: TWorkspaceActor,
    workspaceId: string,
    minRole: TWorkspaceRole,
  ): Promise<IWorkspaceMembership> {
    const userId = actorUserId(actor);

    if (isSuperActor(actor)) {
      if (
        !isUuid(workspaceId) ||
        !(await this._workspaces.existsById(workspaceId))
      ) {
        throw WorkspaceError.NOT_FOUND();
      }

      return {
        workspaceId,
        userId,
        role: WorkspaceRoles.OWNER,
        viaSuperuser: true,
      };
    }

    const role = await this.roleOf(userId, workspaceId);

    if (!role) throw WorkspaceError.NOT_FOUND();

    if (!workspaceRoleCovers(role, minRole)) {
      throw WorkspaceError.FORBIDDEN({ required: minRole, actual: role });
    }

    return { workspaceId, userId, role, viaSuperuser: false };
  }

  /** Участник ли пользователь (без учёта суперпользователя). */
  async isMember(userId: string, workspaceId: string): Promise<boolean> {
    return (await this.roleOf(userId, workspaceId)) !== null;
  }

  /** Состав изменился — прежние ответы для этих пользователей недействительны. */
  invalidate(workspaceId: string, userIds: string[]): Promise<void> {
    return this._cache.invalidate(workspaceId, userIds);
  }
}
