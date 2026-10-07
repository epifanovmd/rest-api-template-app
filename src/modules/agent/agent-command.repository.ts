import { In, LessThan } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import {
  EAgentCommandStatus,
  SETTLED_AGENT_COMMAND_STATUSES,
} from "./agent.types";
import { AgentCommand } from "./agent-command.entity";

@InjectableRepository(AgentCommand)
export class AgentCommandRepository extends BaseRepository<AgentCommand> {
  findById(id: string): Promise<AgentCommand | null> {
    return this.findOne({ where: { id } });
  }

  findPending(agentId: string): Promise<AgentCommand[]> {
    return this.find({
      where: { agentId, status: EAgentCommandStatus.PENDING },
      order: { createdAt: "ASC" },
    });
  }

  findPage(
    agentId: string,
    offset: number,
    limit: number,
  ): Promise<[AgentCommand[], number]> {
    return this.findAndCount({
      where: { agentId },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /** Перевести из одного из `from` в `to`; `false` — статус уже другой. */
  async transition(
    id: string,
    from: EAgentCommandStatus[],
    patch: Partial<AgentCommand> & { status: EAgentCommandStatus },
  ): Promise<boolean> {
    const { affected } = await this.update(
      { id, status: In(from) },
      patch as QueryDeepPartialEntity<AgentCommand>,
    );

    return (affected ?? 0) > 0;
  }

  /** Незавершённые команды, созданные до `before` (кандидаты в timeout). */
  findActiveCreatedBefore(
    before: Date,
    limit: number,
  ): Promise<AgentCommand[]> {
    return this.find({
      where: {
        status: In([EAgentCommandStatus.PENDING, EAgentCommandStatus.RUNNING]),
        createdAt: LessThan(before),
      },
      take: limit,
    });
  }

  async deleteSettledBefore(before: Date): Promise<number> {
    const { affected } = await this.delete({
      status: In(SETTLED_AGENT_COMMAND_STATUSES as EAgentCommandStatus[]),
      finishedAt: LessThan(before),
    });

    return affected ?? 0;
  }
}
