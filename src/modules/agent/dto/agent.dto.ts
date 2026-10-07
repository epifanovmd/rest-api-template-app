import { BaseDto } from "../../../core/dto/BaseDto";
import type { Agent, TAgentHost } from "../agent.entity";
import { EAgentStatus, EAgentTransport } from "../agent.types";
import type { IAlpCapabilities, IAlpMetrics } from "../agent-link.protocol";
import type { IAgentLiveStatus } from "../agent-presence.store";

/** Живое состояние агента: последний `status` и `metrics` (пока на связи). */
export interface IAgentLiveDto {
  status: IAgentLiveStatus | null;
  metrics: IAlpMetrics | null;
}

export class AgentDto extends BaseDto {
  id: string;
  name: string;
  labels: Record<string, string>;
  status: EAgentStatus;
  ephemeral: boolean;
  transport: EAgentTransport | null;
  version: string | null;
  protocol: number | null;
  host: TAgentHost | null;
  capabilities: IAlpCapabilities;
  remoteIp: string | null;
  connectedAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** Только в ответе по одному агенту. */
  live?: IAgentLiveDto;

  constructor(entity: Agent, live?: IAgentLiveDto) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.labels = entity.labels;
    this.status = entity.status;
    this.ephemeral = entity.ephemeral;
    this.transport = entity.transport;
    this.version = entity.version;
    this.protocol = entity.protocol;
    this.host = entity.host;
    this.capabilities = entity.capabilities;
    this.remoteIp = entity.remoteIp;
    this.connectedAt = entity.connectedAt;
    this.lastSeenAt = entity.lastSeenAt;
    this.revokedAt = entity.revokedAt;
    this.createdAt = entity.createdAt;
    if (live) this.live = live;
  }

  static fromEntity(entity: Agent, live?: IAgentLiveDto): AgentDto {
    return new AgentDto(entity, live);
  }
}
