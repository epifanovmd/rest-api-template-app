import { inject } from "inversify";

import {
  EventBus,
  Injectable,
  type IPaginatedDto,
  type Pagination,
  toPage,
} from "../../core";
import { WorkspaceMemberDto } from "./dto";
import {
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { WorkspaceError } from "./workspace.errors";
import {
  type TWorkspaceRole,
  workspaceRoleRank,
  WorkspaceRoles,
} from "./workspace.types";
import {
  type TWorkspaceActor,
  WorkspaceAccessService,
} from "./workspace-access.service";
import type { WorkspaceMember } from "./workspace-member.entity";
import { WorkspaceMemberRepository } from "./workspace-member.repository";

const actorId = (actor: TWorkspaceActor): string =>
  typeof actor === "string" ? actor : actor.userId;

/** Участники пространства: список, роли, удаление, выход. */
@Injectable()
export class WorkspaceMemberService {
  constructor(
    @inject(WorkspaceMemberRepository)
    private readonly _members: WorkspaceMemberRepository,
    @inject(WorkspaceAccessService)
    private readonly _access: WorkspaceAccessService,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  async list(
    actor: TWorkspaceActor,
    workspaceId: string,
    pagination: Pagination,
  ): Promise<IPaginatedDto<WorkspaceMemberDto>> {
    await this._access.require(actor, workspaceId, WorkspaceRoles.VIEWER);

    const [members, total] = await this._members.findPage(
      workspaceId,
      pagination,
    );

    return toPage(
      members.map(WorkspaceMemberDto.fromEntity),
      total,
      pagination,
    );
  }

  /**
   * Сменить роль участника — admin и выше. Нельзя назначить роль выше своей,
   * трогать владельца и участника старше себя; owner — только передачей.
   */
  async changeRole(
    actor: TWorkspaceActor,
    workspaceId: string,
    userId: string,
    role: TWorkspaceRole,
  ): Promise<WorkspaceMemberDto> {
    const me = await this._access.require(
      actor,
      workspaceId,
      WorkspaceRoles.ADMIN,
    );

    if (role === WorkspaceRoles.OWNER) {
      throw WorkspaceError.OWNER_ROLE_VIA_TRANSFER();
    }

    const target = await this._findManageable(workspaceId, userId, me.role);

    if (workspaceRoleRank(role) > workspaceRoleRank(me.role)) {
      throw WorkspaceError.ROLE_TOO_HIGH({ role });
    }

    const previousRole = target.role;

    if (previousRole === role) return WorkspaceMemberDto.fromEntity(target);

    await this._members.update({ id: target.id }, { role });
    target.role = role;
    await this._access.invalidate(workspaceId, [userId]);

    this._eventBus.emit(
      new WorkspaceMemberRoleChangedEvent(
        workspaceId,
        userId,
        role,
        previousRole,
        me.userId,
      ),
    );

    return WorkspaceMemberDto.fromEntity(target);
  }

  /** Удалить участника — admin и выше; себя — это выход. */
  async remove(
    actor: TWorkspaceActor,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    if (actorId(actor) === userId) {
      await this.leave(userId, workspaceId);

      return;
    }

    const me = await this._access.require(
      actor,
      workspaceId,
      WorkspaceRoles.ADMIN,
    );

    await this._findManageable(workspaceId, userId, me.role);
    await this._delete(workspaceId, userId, me.userId);
  }

  /** Выйти из пространства. Владелец сначала передаёт владение. */
  async leave(userId: string, workspaceId: string): Promise<void> {
    const me = await this._access.require(
      userId,
      workspaceId,
      WorkspaceRoles.VIEWER,
    );

    if (me.role === WorkspaceRoles.OWNER) {
      throw WorkspaceError.OWNER_CANNOT_LEAVE();
    }

    await this._delete(workspaceId, userId, userId);
  }

  /** Участник, которым вправе управлять роль `actorRole`: не owner и не старше. */
  private async _findManageable(
    workspaceId: string,
    userId: string,
    actorRole: TWorkspaceRole,
  ): Promise<WorkspaceMember> {
    const target = await this._members.findMembership(
      workspaceId,
      userId,
      true,
    );

    if (!target) throw WorkspaceError.MEMBER_NOT_FOUND({ userId });

    if (
      target.role === WorkspaceRoles.OWNER ||
      workspaceRoleRank(target.role) > workspaceRoleRank(actorRole)
    ) {
      throw WorkspaceError.CANNOT_MANAGE_MEMBER({ userId });
    }

    return target;
  }

  private async _delete(
    workspaceId: string,
    userId: string,
    actorUserId: string,
  ): Promise<void> {
    const result = await this._members.delete({ workspaceId, userId });

    await this._access.invalidate(workspaceId, [userId]);

    if (!result.affected) return;

    this._eventBus.emit(
      new WorkspaceMemberRemovedEvent(workspaceId, userId, actorUserId),
    );
  }
}
