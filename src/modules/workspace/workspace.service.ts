import { randomBytes } from "crypto";
import { inject } from "inversify";
import { DataSource, EntityManager, In } from "typeorm";

import {
  EventBus,
  Injectable,
  type IPaginatedDto,
  isUniqueViolation,
  logger,
  type Pagination,
  toPage,
} from "../../core";
import type { AuthContext } from "../../types/koa";
import type { ICreateWorkspaceBody, IUpdateWorkspaceBody } from "./dto";
import { WorkspaceDto } from "./dto";
import {
  WorkspaceDeletedEvent,
  WorkspaceMemberAddedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { Workspace } from "./workspace.entity";
import { WorkspaceError } from "./workspace.errors";
import { WorkspaceRepository } from "./workspace.repository";
import {
  type TWorkspaceRole,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
  WorkspaceRoles,
} from "./workspace.types";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspaceMember } from "./workspace-member.entity";
import { WorkspaceMemberRepository } from "./workspace-member.repository";

/** Попыток подобрать свободный сгенерированный slug. */
const SLUG_ATTEMPTS = 3;
const SLUG_SUFFIX_LENGTH = 7;

/** Slug из названия: латиница и цифры, остальное — дефис; плюс случайный хвост. */
export const generateSlug = (name: string): string => {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WORKSPACE_SLUG_MAX - SLUG_SUFFIX_LENGTH)
    .replace(/-+$/g, "");
  const suffix = randomBytes(3).toString("hex");

  return `${base.length >= WORKSPACE_SLUG_MIN ? base : "workspace"}-${suffix}`;
};

/** Пространства: создание, настройки, удаление, передача владения. */
@Injectable()
export class WorkspaceService {
  constructor(
    @inject(WorkspaceRepository)
    private readonly _workspaces: WorkspaceRepository,
    @inject(WorkspaceMemberRepository)
    private readonly _members: WorkspaceMemberRepository,
    @inject(WorkspaceAccessService)
    private readonly _access: WorkspaceAccessService,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(DataSource) private readonly _dataSource: DataSource,
  ) {}

  /** Создать пространство; создатель становится owner. */
  async create(
    userId: string,
    body: ICreateWorkspaceBody,
  ): Promise<WorkspaceDto> {
    const attempts = body.slug ? 1 : SLUG_ATTEMPTS;

    for (let attempt = 1; ; attempt += 1) {
      const slug = body.slug ?? generateSlug(body.name);

      try {
        const workspace = await this._dataSource.transaction(async manager => {
          const repo = manager.getRepository(Workspace);
          const saved = await repo.save(
            repo.create({
              name: body.name,
              slug,
              description: body.description || null,
              ownerId: userId,
            }),
          );

          await manager.getRepository(WorkspaceMember).save({
            workspaceId: saved.id,
            userId,
            role: WorkspaceRoles.OWNER,
          });

          return saved;
        });

        this._eventBus.emit(
          new WorkspaceMemberAddedEvent(
            workspace.id,
            userId,
            WorkspaceRoles.OWNER,
            userId,
          ),
        );

        return WorkspaceDto.fromEntity(workspace, WorkspaceRoles.OWNER);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (attempt >= attempts) throw WorkspaceError.SLUG_TAKEN({ slug });
      }
    }
  }

  /** Пространства пользователя с его ролью; архивные — по запросу. */
  async listForUser(
    userId: string,
    pagination: Pagination,
    includeArchived = false,
  ): Promise<IPaginatedDto<WorkspaceDto>> {
    const [memberships, total] = await this._members.findPageByUser(
      userId,
      pagination,
      includeArchived,
    );

    return toPage(
      memberships.map(m => WorkspaceDto.fromEntity(m.workspace, m.role)),
      total,
      pagination,
    );
  }

  async get(actor: AuthContext, id: string): Promise<WorkspaceDto> {
    const membership = await this._access.require(
      actor,
      id,
      WorkspaceRoles.VIEWER,
    );

    return WorkspaceDto.fromEntity(await this._findOrFail(id), membership.role);
  }

  /** Название, slug, архивирование — admin и выше. */
  async update(
    actor: AuthContext,
    id: string,
    body: IUpdateWorkspaceBody,
  ): Promise<WorkspaceDto> {
    const membership = await this._access.require(
      actor,
      id,
      WorkspaceRoles.ADMIN,
    );
    const workspace = await this._findOrFail(id);

    if (body.name !== undefined) workspace.name = body.name;
    if (body.slug !== undefined) workspace.slug = body.slug;
    if (body.description !== undefined) {
      workspace.description = body.description || null;
    }
    if (body.archived !== undefined) {
      workspace.archivedAt = body.archived
        ? (workspace.archivedAt ?? new Date())
        : null;
    }

    try {
      const saved = await this._workspaces.save(workspace);

      return WorkspaceDto.fromEntity(saved, membership.role);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw WorkspaceError.SLUG_TAKEN({ slug: body.slug });
      }
      throw err;
    }
  }

  /** Удалить пространство — только owner. Участники и приглашения — каскадом. */
  async delete(actor: AuthContext, id: string): Promise<void> {
    await this._access.require(actor, id, WorkspaceRoles.OWNER);
    await this._remove(id, actor.userId);
  }

  /**
   * Передать владение участнику. Прежний владелец становится admin.
   * Строка пространства блокируется: две передачи подряд не дадут двух владельцев.
   */
  async transferOwnership(
    actor: AuthContext,
    id: string,
    newOwnerId: string,
  ): Promise<WorkspaceDto> {
    const membership = await this._access.require(
      actor,
      id,
      WorkspaceRoles.OWNER,
    );

    const { workspace, demoted, previousRole } =
      await this._dataSource.transaction(async manager => {
        const locked = await this._lockWorkspace(manager, id);
        const memberRepo = manager.getRepository(WorkspaceMember);
        const target = await memberRepo.findOne({
          where: { workspaceId: id, userId: newOwnerId },
        });

        if (!target)
          throw WorkspaceError.MEMBER_NOT_FOUND({ userId: newOwnerId });
        if (target.role === WorkspaceRoles.OWNER) {
          throw WorkspaceError.TRANSFER_TO_SELF();
        }

        const owners = await memberRepo.find({
          where: { workspaceId: id, role: WorkspaceRoles.OWNER },
        });
        const ownerIds = owners.map(owner => owner.userId);

        if (ownerIds.length > 0) {
          await memberRepo.update(
            { workspaceId: id, userId: In(ownerIds) },
            { role: WorkspaceRoles.ADMIN },
          );
        }

        await memberRepo.update(
          { id: target.id },
          { role: WorkspaceRoles.OWNER },
        );
        locked.ownerId = newOwnerId;
        await manager.getRepository(Workspace).save(locked);

        return {
          workspace: locked,
          demoted: ownerIds,
          previousRole: target.role,
        };
      });

    await this._access.invalidate(id, [...demoted, newOwnerId]);

    for (const userId of demoted) {
      this._eventBus.emit(
        new WorkspaceMemberRoleChangedEvent(
          id,
          userId,
          WorkspaceRoles.ADMIN,
          WorkspaceRoles.OWNER,
          actor.userId,
        ),
      );
    }

    this._eventBus.emit(
      new WorkspaceMemberRoleChangedEvent(
        id,
        newOwnerId,
        WorkspaceRoles.OWNER,
        previousRole,
        actor.userId,
      ),
    );

    const actorRole: TWorkspaceRole =
      actor.userId === newOwnerId
        ? WorkspaceRoles.OWNER
        : demoted.includes(actor.userId)
          ? WorkspaceRoles.ADMIN
          : membership.role;

    return WorkspaceDto.fromEntity(workspace, actorRole);
  }

  /**
   * Пользователь удалён; его членства уже сняты каскадом. Пространства без
   * участников удаляются, без владельца — переходят старейшему admin, иначе
   * старейшему участнику. Проход идемпотентен и подбирает хвосты прошлых сбоев.
   */
  async handleUserDeleted(): Promise<void> {
    for (const id of await this._workspaces.findOrphanIds()) {
      await this._isolate(id, () => this._remove(id, null));
    }

    for (const id of await this._workspaces.findWithoutOwnerIds()) {
      await this._isolate(id, () => this._reassignOwner(id));
    }
  }

  private async _reassignOwner(id: string): Promise<void> {
    const candidate = await this._members.findOwnershipCandidate(id);

    if (!candidate) {
      await this._remove(id, null);

      return;
    }

    await this._dataSource.transaction(async manager => {
      const locked = await this._lockWorkspace(manager, id);

      await manager
        .getRepository(WorkspaceMember)
        .update({ id: candidate.id }, { role: WorkspaceRoles.OWNER });
      locked.ownerId = candidate.userId;
      await manager.getRepository(Workspace).save(locked);
    });

    await this._access.invalidate(id, [candidate.userId]);

    this._eventBus.emit(
      new WorkspaceMemberRoleChangedEvent(
        id,
        candidate.userId,
        WorkspaceRoles.OWNER,
        candidate.role,
        null,
      ),
    );
  }

  private async _remove(id: string, actorId: string | null): Promise<void> {
    const memberUserIds = await this._members.findUserIds(id);

    await this._workspaces.delete({ id });
    await this._access.invalidate(id, memberUserIds);

    this._eventBus.emit(new WorkspaceDeletedEvent(id, memberUserIds, actorId));
  }

  private async _lockWorkspace(
    manager: EntityManager,
    id: string,
  ): Promise<Workspace> {
    const workspace = await manager.getRepository(Workspace).findOne({
      where: { id },
      lock: { mode: "pessimistic_write" },
    });

    if (!workspace) throw WorkspaceError.NOT_FOUND();

    return workspace;
  }

  private async _findOrFail(id: string): Promise<Workspace> {
    const workspace = await this._workspaces.findById(id);

    if (!workspace) throw WorkspaceError.NOT_FOUND();

    return workspace;
  }

  /** Сбой одного пространства не мешает обработать остальные. */
  private async _isolate(id: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      logger.error({ err, workspaceId: id }, "[Workspace] Очистка не удалась");
    }
  }
}
