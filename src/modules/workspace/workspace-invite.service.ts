import { randomBytes } from "crypto";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import {
  EventBus,
  hashToken,
  Injectable,
  type IPaginatedDto,
  isUniqueViolation,
  type Pagination,
  toPage,
} from "../../core";
import type { AuthContext } from "../../types/koa";
import { UserRepository } from "../user";
import { User } from "../user/user.entity";
import type { ICreateWorkspaceInviteBody } from "./dto";
import { WorkspaceDto, WorkspaceInviteDto } from "./dto";
import { WorkspaceMemberAddedEvent } from "./events";
import { Workspace } from "./workspace.entity";
import { WorkspaceError } from "./workspace.errors";
import {
  type TWorkspaceRole,
  WORKSPACE_INVITE_TTL_MS,
  workspaceRoleRank,
  WorkspaceRoles,
} from "./workspace.types";
import {
  type TWorkspaceActor,
  WorkspaceAccessService,
} from "./workspace-access.service";
import { WorkspaceInvite } from "./workspace-invite.entity";
import {
  workspaceInviteLink,
  WorkspaceInviteMailer,
} from "./workspace-invite.mail";
import { WorkspaceInviteRepository } from "./workspace-invite.repository";
import { WorkspaceMember } from "./workspace-member.entity";
import { WorkspaceMemberRepository } from "./workspace-member.repository";

const INVITE_TOKEN_BYTES = 32;

/**
 * Приглашения по email. Токен создаётся здесь, уходит только в письме, в БД
 * лежит его хеш. Письмо ставится в очередь в той же транзакции, что и
 * приглашение: без приглашения письма нет, и наоборот.
 */
@Injectable()
export class WorkspaceInviteService {
  constructor(
    @inject(WorkspaceInviteRepository)
    private readonly _invites: WorkspaceInviteRepository,
    @inject(WorkspaceMemberRepository)
    private readonly _members: WorkspaceMemberRepository,
    @inject(WorkspaceAccessService)
    private readonly _access: WorkspaceAccessService,
    @inject(UserRepository) private readonly _users: UserRepository,
    @inject(WorkspaceInviteMailer)
    private readonly _mailer: WorkspaceInviteMailer,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(DataSource) private readonly _dataSource: DataSource,
  ) {}

  /**
   * Пригласить по email — admin и выше, роль не выше своей. Действующее
   * приглашение на тот же email отзывается: новое его заменяет.
   */
  async create(
    actor: TWorkspaceActor,
    workspaceId: string,
    body: ICreateWorkspaceInviteBody,
  ): Promise<WorkspaceInviteDto> {
    const me = await this._access.require(
      actor,
      workspaceId,
      WorkspaceRoles.ADMIN,
    );
    const { role } = body;

    if (workspaceRoleRank(role) > workspaceRoleRank(me.role)) {
      throw WorkspaceError.ROLE_TOO_HIGH({ role });
    }

    const email = body.email.trim().toLowerCase();

    if (await this._members.existsByEmail(workspaceId, email)) {
      throw WorkspaceError.ALREADY_MEMBER({ email });
    }

    const token = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");

    const invite = await this._dataSource.transaction(async manager => {
      const workspace = await manager
        .getRepository(Workspace)
        .findOne({ where: { id: workspaceId } });

      if (!workspace) throw WorkspaceError.NOT_FOUND();

      const repo = manager.getRepository(WorkspaceInvite);

      await this._invites.revokePending(workspaceId, email, manager);

      const saved = await repo.save(
        repo.create({
          workspaceId,
          email,
          role,
          tokenHash: hashToken(token),
          invitedBy: me.userId,
          expiresAt: new Date(Date.now() + WORKSPACE_INVITE_TTL_MS),
          acceptedAt: null,
          revokedAt: null,
        }),
      );

      await this._mailer.send(
        email,
        {
          workspaceName: workspace.name,
          role,
          inviteLink: workspaceInviteLink(token),
        },
        manager,
      );

      return saved;
    });

    return WorkspaceInviteDto.fromEntity(invite);
  }

  /** Приглашения пространства (все состояния) — admin и выше. */
  async list(
    actor: TWorkspaceActor,
    workspaceId: string,
    pagination: Pagination,
  ): Promise<IPaginatedDto<WorkspaceInviteDto>> {
    await this._access.require(actor, workspaceId, WorkspaceRoles.ADMIN);

    const [invites, total] = await this._invites.findPage(
      workspaceId,
      pagination,
    );

    return toPage(
      invites.map(WorkspaceInviteDto.fromEntity),
      total,
      pagination,
    );
  }

  /** Отозвать приглашение; повторный отзыв — без ошибки. */
  async revoke(
    actor: TWorkspaceActor,
    workspaceId: string,
    inviteId: string,
  ): Promise<void> {
    await this._access.require(actor, workspaceId, WorkspaceRoles.ADMIN);

    const invite = await this._invites.findInWorkspace(workspaceId, inviteId);

    if (!invite) throw WorkspaceError.INVITE_NOT_FOUND();
    if (invite.acceptedAt) throw WorkspaceError.INVITE_ALREADY_USED();
    if (invite.revokedAt) return;

    await this._invites.markRevoked(invite.id, new Date());
  }

  /**
   * Принять приглашение. Email приглашения должен совпасть с email
   * пользователя; неподтверждённый email подтверждается: токен приходит только
   * в этот ящик, переход по ссылке доказывает владение им. Уже участник — роль
   * не меняется, приглашение гасится.
   */
  async accept(actor: AuthContext, token: string): Promise<WorkspaceDto> {
    const invite = await this._invites.findByTokenHash(hashToken(token));
    const now = new Date();

    if (!invite || invite.revokedAt) throw WorkspaceError.INVITE_NOT_FOUND();
    if (invite.acceptedAt) throw WorkspaceError.INVITE_ALREADY_USED();
    if (invite.expiresAt <= now) throw WorkspaceError.INVITE_EXPIRED();

    const user = await this._users.findById(actor.userId);

    if (!user || user.email?.trim().toLowerCase() !== invite.email) {
      throw WorkspaceError.INVITE_EMAIL_MISMATCH();
    }

    let result: { workspace: Workspace; role: TWorkspaceRole; added: boolean };

    try {
      result = await this._dataSource.transaction(async manager => {
        if (!(await this._invites.markAccepted(invite.id, now, manager))) {
          throw WorkspaceError.INVITE_ALREADY_USED();
        }

        const workspace = await manager
          .getRepository(Workspace)
          .findOne({ where: { id: invite.workspaceId } });

        if (!workspace) throw WorkspaceError.INVITE_NOT_FOUND();

        if (!user.emailVerified) {
          await manager
            .getRepository(User)
            .update(user.id, { emailVerified: true });
        }

        const memberRepo = manager.getRepository(WorkspaceMember);
        const existing = await memberRepo.findOne({
          where: { workspaceId: invite.workspaceId, userId: actor.userId },
        });

        if (existing) return { workspace, role: existing.role, added: false };

        await memberRepo.save(
          memberRepo.create({
            workspaceId: invite.workspaceId,
            userId: actor.userId,
            role: invite.role,
          }),
        );

        return { workspace, role: invite.role, added: true };
      });
    } catch (err) {
      // Параллельное принятие другого приглашения в то же пространство.
      if (isUniqueViolation(err)) throw WorkspaceError.ALREADY_MEMBER();
      throw err;
    }

    await this._access.invalidate(invite.workspaceId, [actor.userId]);

    if (result.added) {
      this._eventBus.emit(
        new WorkspaceMemberAddedEvent(
          invite.workspaceId,
          actor.userId,
          result.role,
          invite.invitedBy,
        ),
      );
    }

    return WorkspaceDto.fromEntity(result.workspace, result.role);
  }
}
