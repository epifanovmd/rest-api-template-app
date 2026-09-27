import { IsNull } from "typeorm";

import { BaseRepository, InjectableRepository, Pagination } from "../../core";
import { WorkspaceRoles } from "./workspace.types";
import { WorkspaceMember } from "./workspace-member.entity";

@InjectableRepository(WorkspaceMember)
export class WorkspaceMemberRepository extends BaseRepository<WorkspaceMember> {
  async findMembership(
    workspaceId: string,
    userId: string,
    withUser = false,
  ): Promise<WorkspaceMember | null> {
    return this.findOne({
      where: { workspaceId, userId },
      relations: withUser ? { user: { profile: true } } : undefined,
    });
  }

  /** Участники пространства — старшие по времени вступления первыми. */
  async findPage(
    workspaceId: string,
    { offset, limit }: Pagination,
  ): Promise<[WorkspaceMember[], number]> {
    return this.findAndCount({
      where: { workspaceId },
      relations: { user: { profile: true } },
      order: { createdAt: "ASC", id: "ASC" },
      skip: offset,
      take: limit,
    });
  }

  /** Членства пользователя вместе с пространствами — новые первыми. */
  async findPageByUser(
    userId: string,
    { offset, limit }: Pagination,
    includeArchived: boolean,
  ): Promise<[WorkspaceMember[], number]> {
    return this.findAndCount({
      where: {
        userId,
        ...(includeArchived ? {} : { workspace: { archivedAt: IsNull() } }),
      },
      relations: { workspace: true },
      order: { createdAt: "DESC", id: "ASC" },
      skip: offset,
      take: limit,
    });
  }

  async findUserIds(workspaceId: string): Promise<string[]> {
    const rows = await this.find({
      where: { workspaceId },
      select: { userId: true },
    });

    return rows.map(row => row.userId);
  }

  async findWorkspaceIdsByUser(userId: string): Promise<string[]> {
    const rows = await this.find({
      where: { userId },
      select: { workspaceId: true },
    });

    return rows.map(row => row.workspaceId);
  }

  /** Участник с таким email (без учёта регистра). */
  async existsByEmail(workspaceId: string, email: string): Promise<boolean> {
    return this.createQueryBuilder("m")
      .innerJoin("m.user", "u")
      .where("m.workspace_id = :workspaceId", { workspaceId })
      .andWhere("LOWER(u.email) = LOWER(:email)", { email })
      .getExists();
  }

  /** Кандидат во владельцы: старейший admin, иначе старейший участник. */
  async findOwnershipCandidate(
    workspaceId: string,
  ): Promise<WorkspaceMember | null> {
    return this.createQueryBuilder("m")
      .where("m.workspace_id = :workspaceId", { workspaceId })
      .orderBy(
        `CASE WHEN m.role = '${WorkspaceRoles.ADMIN}' THEN 0 ELSE 1 END`,
        "ASC",
      )
      .addOrderBy("m.created_at", "ASC")
      .addOrderBy("m.id", "ASC")
      .getOne();
  }
}
