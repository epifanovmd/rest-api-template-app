import type { EntityManager } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { AgentEnrollmentToken } from "./agent-enrollment-token.entity";

@InjectableRepository(AgentEnrollmentToken)
export class AgentEnrollmentTokenRepository extends BaseRepository<AgentEnrollmentToken> {
  findById(id: string): Promise<AgentEnrollmentToken | null> {
    return this.findOne({ where: { id } });
  }

  findByPrefix(prefix: string): Promise<AgentEnrollmentToken | null> {
    return this.findOne({ where: { prefix } });
  }

  findPage(
    offset: number,
    limit: number,
  ): Promise<[AgentEnrollmentToken[], number]> {
    return this.findAndCount({
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Атомарно занять одно использование токена: действующий, не отозван, не
   * исчерпан. `false` — использовать нельзя (гонка за последнее место тоже).
   */
  async consume(
    id: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const { affected } = await (manager ?? this.manager)
      .createQueryBuilder()
      .update(AgentEnrollmentToken)
      .set({ uses: () => "uses + 1" })
      .where("id = :id AND revoked_at IS NULL", { id })
      .andWhere("(expires_at IS NULL OR expires_at > :now)", { now })
      .andWhere("(max_uses IS NULL OR uses < max_uses)")
      .execute();

    return (affected ?? 0) > 0;
  }
}
