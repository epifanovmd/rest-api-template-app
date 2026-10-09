import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { AgentMetric } from "./agent-metric.entity";

export interface IAgentMetricFilter {
  agentId: string;
  /** Строго позже, мс. */
  since?: number;
  /** Не позже, мс. */
  until?: number;
  /** Последние столько точек. */
  limit: number;
}

@InjectableRepository(AgentMetric)
export class AgentMetricRepository extends BaseRepository<AgentMetric> {
  /** Точки по возрастанию времени: последние `limit` в окне. */
  async findRange(filter: IAgentMetricFilter): Promise<AgentMetric[]> {
    const qb = this.createQueryBuilder("m").where("m.agentId = :agentId", {
      agentId: filter.agentId,
    });

    if (filter.since !== undefined) {
      qb.andWhere("m.at > :since", { since: filter.since });
    }
    if (filter.until !== undefined) {
      qb.andWhere("m.at <= :until", { until: filter.until });
    }

    const rows = await qb.orderBy("m.at", "DESC").limit(filter.limit).getMany();

    return rows.reverse();
  }

  /** Время последней сохранённой точки агента, мс; нет — `null`. */
  async findLastAt(agentId: string): Promise<number | null> {
    const row = await this.createQueryBuilder("m")
      .select("MAX(m.at)", "at")
      .where("m.agentId = :agentId", { agentId })
      .getRawOne<{ at: string | null }>();

    return row?.at ? Number(row.at) : null;
  }

  async deleteBefore(before: number): Promise<number> {
    const { affected } = await this.createQueryBuilder()
      .delete()
      .where("at < :before", { before })
      .execute();

    return affected ?? 0;
  }

  async deleteByAgent(agentId: string): Promise<void> {
    await this.delete({ agentId });
  }
}
