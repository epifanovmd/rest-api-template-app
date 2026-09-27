import { EntityManager } from "typeorm";

import { BaseRepository, InjectableRepository, Pagination } from "../../core";
import { WorkspaceInvite } from "./workspace-invite.entity";

@InjectableRepository(WorkspaceInvite)
export class WorkspaceInviteRepository extends BaseRepository<WorkspaceInvite> {
  async findByTokenHash(tokenHash: string): Promise<WorkspaceInvite | null> {
    return this.findOne({ where: { tokenHash } });
  }

  async findInWorkspace(
    workspaceId: string,
    id: string,
  ): Promise<WorkspaceInvite | null> {
    return this.findOne({ where: { workspaceId, id } });
  }

  async findPage(
    workspaceId: string,
    { offset, limit }: Pagination,
  ): Promise<[WorkspaceInvite[], number]> {
    return this.findAndCount({
      where: { workspaceId },
      order: { createdAt: "DESC", id: "ASC" },
      skip: offset,
      take: limit,
    });
  }

  /** Отозвать действующие приглашения на email: новое их заменяет. */
  async revokePending(
    workspaceId: string,
    email: string,
    manager: EntityManager = this.manager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(WorkspaceInvite)
      .set({ revokedAt: () => "now()" })
      .where("workspace_id = :workspaceId", { workspaceId })
      .andWhere("email = :email", { email })
      .andWhere("accepted_at IS NULL")
      .andWhere("revoked_at IS NULL")
      .execute();
  }

  /**
   * Атомарно пометить принятым, если оно ещё действует. `false` —
   * приглашение успели принять, отозвать или оно истекло.
   */
  async markAccepted(
    id: string,
    now: Date,
    manager: EntityManager = this.manager,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(WorkspaceInvite)
      .set({ acceptedAt: now })
      .where("id = :id", { id })
      .andWhere("accepted_at IS NULL")
      .andWhere("revoked_at IS NULL")
      .andWhere("expires_at > :now", { now })
      .execute();

    return !!result.affected;
  }

  /** Отозвать, если ещё не принято и не отозвано. */
  async markRevoked(id: string, now: Date): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(WorkspaceInvite)
      .set({ revokedAt: now })
      .where("id = :id", { id })
      .andWhere("accepted_at IS NULL")
      .andWhere("revoked_at IS NULL")
      .execute();

    return !!result.affected;
  }
}
