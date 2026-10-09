import { In, IsNull, Not, SelectQueryBuilder } from "typeorm";

import type { Pagination } from "../../core";
import { BaseRepository, InjectableRepository } from "../../core";
import { escapeLike } from "../user";
import { NodeAccess } from "./node.access";
import { Node } from "./node.entity";

export interface INodeFilters {
  /** Поиск по названию и адресу. */
  query?: string;
  /** Только свои узлы пользователя: владелец или создатель. */
  ownedBy?: string;
}

/** Чем узел без агента сопоставляется с агентом: одно из полей. */
export type TNodeAgentMatch = Partial<
  Record<"agentName" | "name" | "host", string>
>;

/** Узел для проверки сети: id, имя, адрес, агент. */
export type TNodeProbeRow = Pick<Node, "id" | "name" | "host" | "agentId">;

@InjectableRepository(Node)
export class NodeRepository extends BaseRepository<Node> {
  findPage(
    { query, ownedBy }: INodeFilters,
    { offset, limit }: Pagination,
  ): Promise<[Node[], number]> {
    const qb = this._withOwners()
      .orderBy("node.createdAt", "DESC")
      .addOrderBy("node.id", "DESC")
      .skip(offset)
      .take(limit);

    if (ownedBy) qb.andWhere(NodeAccess.ownedCondition("node"), { ownedBy });
    if (query) {
      qb.andWhere("(node.name ILIKE :query OR node.host ILIKE :query)", {
        query: `%${escapeLike(query)}%`,
      });
    }

    return qb.getManyAndCount();
  }

  /** Узел с именами владельца и создателя. */
  findWithOwners(id: string): Promise<Node | null> {
    return this._withOwners().where("node.id = :id", { id }).getOne();
  }

  findById(id: string): Promise<Node | null> {
    return this.findOne({ where: { id } });
  }

  findByAgentId(agentId: string): Promise<Node | null> {
    return this.findOne({ where: { agentId } });
  }

  /** Краткий список по названию; `ownedBy` — только свои. */
  findOptions(ownedBy?: string): Promise<Node[]> {
    return this.find({
      select: { id: true, name: true, host: true, agentId: true },
      where: ownedBy ? NodeAccess.ownedWhere(ownedBy) : {},
      order: { name: "ASC", id: "ASC" },
    });
  }

  /** Все узлы (или из списка) для проверки сети, по времени создания. */
  findForProbe(ids?: string[]): Promise<TNodeProbeRow[]> {
    return this.find({
      select: { id: true, name: true, host: true, agentId: true },
      where: ids ? { id: In(ids) } : {},
      order: { createdAt: "ASC", id: "ASC" },
    });
  }

  /** Владельцы и создатели узлов из списка. */
  findOwners(
    ids: string[],
  ): Promise<Pick<Node, "id" | "ownerId" | "createdById">[]> {
    if (!ids.length) return Promise.resolve([]);

    return this.find({
      select: { id: true, ownerId: true, createdById: true },
      where: { id: In(ids) },
    });
  }

  /** Агенты узлов: все или свои (`ownedBy`). */
  async findAgentIds(ownedBy?: string): Promise<string[]> {
    const rows = await this.find({
      select: { id: true, agentId: true },
      where: ownedBy
        ? NodeAccess.ownedWhere(ownedBy).map(where => ({
            ...where,
            agentId: Not(IsNull()),
          }))
        : { agentId: Not(IsNull()) },
    });

    return rows.flatMap(row => (row.agentId ? [row.agentId] : []));
  }

  /** Привязать агента к узлу (прежний агент узла заменяется). */
  async setAgent(
    id: string,
    agentId: string,
    agentName: string,
  ): Promise<boolean> {
    const { affected } = await this.update({ id }, { agentId, agentName });

    return (affected ?? 0) > 0;
  }

  /** Привязать агента к узлу, только если у узла агента нет. */
  async bindFree(
    id: string,
    agentId: string,
    agentName: string,
  ): Promise<boolean> {
    const { affected } = await this.update(
      { id, agentId: IsNull() },
      { agentId, agentName },
    );

    return (affected ?? 0) > 0;
  }

  /**
   * Узлы без агента, подходящие агенту по прежнему имени агента узла, по
   * имени узла или по адресу (`host`), — по времени создания.
   */
  findUnbound(match: TNodeAgentMatch): Promise<Node[]> {
    return this.find({
      where: { ...match, agentId: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  /** Отвязать агента; вернуть id узла, к которому он был привязан. */
  /**
   * Адрес узла без адреса — адрес его агента (первое подключение
   * автоматически созданного узла). Возвращает id изменённого узла.
   */
  async fillHost(agentId: string, host: string): Promise<string | null> {
    const result = await this.createQueryBuilder()
      .update(Node)
      .set({ host })
      .where("agent_id = :agentId AND host IS NULL", { agentId })
      .returning(["id"])
      .execute();
    const rows = (result.raw as { id: string }[] | undefined) ?? [];

    return rows[0]?.id ?? null;
  }

  async clearAgent(agentId: string): Promise<string | null> {
    const result = await this.createQueryBuilder()
      .update(Node)
      .set({ agentId: null })
      .where("agent_id = :agentId", { agentId })
      .returning(["id"])
      .execute();
    const rows = (result.raw as { id: string }[] | undefined) ?? [];

    return rows[0]?.id ?? null;
  }

  private _withOwners(): SelectQueryBuilder<Node> {
    return this.createQueryBuilder("node")
      .leftJoin("node.owner", "owner")
      .addSelect(["owner.id", "owner.email"])
      .leftJoin("owner.profile", "ownerProfile")
      .addSelect([
        "ownerProfile.id",
        "ownerProfile.firstName",
        "ownerProfile.lastName",
      ])
      .leftJoin("node.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.email"])
      .leftJoin("createdBy.profile", "createdByProfile")
      .addSelect([
        "createdByProfile.id",
        "createdByProfile.firstName",
        "createdByProfile.lastName",
      ]);
  }
}
