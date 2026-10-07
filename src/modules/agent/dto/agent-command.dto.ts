import { BaseDto } from "../../../core/dto/BaseDto";
import { EAgentCommandStatus } from "../agent.types";
import type { AgentCommand, IAgentCommandError } from "../agent-command.entity";

export class AgentCommandDto extends BaseDto {
  id: string;
  agentId: string;
  name: string;
  args: unknown;
  status: EAgentCommandStatus;
  output: string;
  result: unknown;
  error: IAgentCommandError | null;
  exitCode: number | null;
  timeoutSec: number;
  requestedBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;

  constructor(entity: AgentCommand) {
    super(entity);

    this.id = entity.id;
    this.agentId = entity.agentId;
    this.name = entity.name;
    this.args = entity.args;
    this.status = entity.status;
    this.output = entity.output;
    this.result = entity.result;
    this.error = entity.error;
    this.exitCode = entity.exitCode;
    this.timeoutSec = entity.timeoutSec;
    this.requestedBy = entity.requestedBy;
    this.createdAt = entity.createdAt;
    this.startedAt = entity.startedAt;
    this.finishedAt = entity.finishedAt;
  }

  static fromEntity(entity: AgentCommand): AgentCommandDto {
    return new AgentCommandDto(entity);
  }
}

export interface ICreateAgentCommandBody {
  /**
   * Имя команды из списка, объявленного агентом: `agent.logs`, `agent.drain`.
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  /** Аргументы команды (схема — у команды). */
  args?: unknown;
  /** Сколько ждать итога, секунд (по умолчанию 60, не больше 3600). */
  timeoutSec?: number;
}

export interface IUpdateAgentBody {
  /** Версия; без неё — последняя. */
  version?: string;
}
