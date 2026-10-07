import { In, LessThan } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Agent } from "./agent.entity";
import { EAgentStatus } from "./agent.types";

export interface IAgentFilter {
  status?: EAgentStatus;
  offset: number;
  limit: number;
}

@InjectableRepository(Agent)
export class AgentRepository extends BaseRepository<Agent> {
  findById(id: string): Promise<Agent | null> {
    return this.findOne({ where: { id } });
  }

  findPage({
    status,
    offset,
    limit,
  }: IAgentFilter): Promise<[Agent[], number]> {
    return this.findAndCount({
      where: status ? { status } : {},
      order: { name: "ASC", createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /** Агенты на связи, у которых давно не было пульса. */
  findSilent(before: Date, limit: number): Promise<Agent[]> {
    return this.find({
      where: { status: EAgentStatus.ONLINE, lastSeenAt: LessThan(before) },
      take: limit,
    });
  }

  /** Перевести в offline, если сессия та же и пульса не было с `before`. */
  async markOffline(
    id: string,
    sessionId: string | null,
    before: Date,
  ): Promise<boolean> {
    const query = this.createQueryBuilder()
      .update()
      .set({ status: EAgentStatus.OFFLINE })
      .where("id = :id AND status = :online", {
        id,
        online: EAgentStatus.ONLINE,
      })
      .andWhere("(last_seen_at IS NULL OR last_seen_at < :before)", { before });

    if (sessionId) query.andWhere("session_id = :sessionId", { sessionId });

    const { affected } = await query.execute();

    return (affected ?? 0) > 0;
  }

  /** Удалить эфемерных агентов без связи с `before`; вернуть сколько. */
  async deleteForgottenEphemeral(before: Date): Promise<number> {
    const { affected } = await this.delete({
      ephemeral: true,
      status: EAgentStatus.OFFLINE,
      lastSeenAt: LessThan(before),
    });

    return affected ?? 0;
  }

  findByIds(ids: string[]): Promise<Agent[]> {
    return ids.length
      ? this.find({ where: { id: In(ids) } })
      : Promise.resolve([]);
  }
}
