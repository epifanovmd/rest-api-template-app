import { BaseRepository, InjectableRepository } from "../../core";
import { Workspace } from "./workspace.entity";
import { WorkspaceRoles } from "./workspace.types";
import { WorkspaceMember } from "./workspace-member.entity";

@InjectableRepository(Workspace)
export class WorkspaceRepository extends BaseRepository<Workspace> {
  async findById(id: string): Promise<Workspace | null> {
    return this.findOne({ where: { id } });
  }

  async existsById(id: string): Promise<boolean> {
    return this.exists({ where: { id } });
  }

  /** Пространства без единого участника: остались после удаления пользователя. */
  async findOrphanIds(): Promise<string[]> {
    const rows = await this.createQueryBuilder("w")
      .select("w.id", "id")
      .where(qb => {
        const sub = qb
          .subQuery()
          .select("1")
          .from(WorkspaceMember, "m")
          .where("m.workspace_id = w.id")
          .getQuery();

        return `NOT EXISTS ${sub}`;
      })
      .getRawMany<{ id: string }>();

    return rows.map(row => row.id);
  }

  /** Пространства, где не осталось участника-владельца. */
  async findWithoutOwnerIds(): Promise<string[]> {
    const rows = await this.createQueryBuilder("w")
      .select("w.id", "id")
      .where(qb => {
        const sub = qb
          .subQuery()
          .select("1")
          .from(WorkspaceMember, "m")
          .where("m.workspace_id = w.id")
          .andWhere("m.role = :owner")
          .getQuery();

        return `NOT EXISTS ${sub}`;
      })
      .setParameter("owner", WorkspaceRoles.OWNER)
      .getRawMany<{ id: string }>();

    return rows.map(row => row.id);
  }
}
