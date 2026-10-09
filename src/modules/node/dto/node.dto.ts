import { BaseDto } from "../../../core";
import type { AgentDto } from "../../agent";
import type { JobRunDto } from "../../jobs";
import type { EJobRunStatus } from "../../jobs";
import { userDisplayName } from "../../user";
import type { Node } from "../node.entity";
import type {
  ENodeConfigStatus,
  ENodeJobKind,
  ENodeStatus,
} from "../node.types";
import type { INodeConfigSummary, INodeStatusResult } from "../node-status";

/** Узел агента кратко (из приветствия). */
export interface INodeAgentHostDto {
  hostname: string;
  os: string;
  arch: string;
}

/** Агент узла кратко. */
export interface INodeAgentDto {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  /** Версия агента. */
  version: string | null;
  /** Адрес последнего подключения. */
  address: string | null;
  /** Последнее сообщение, мс. */
  lastSeenAt: number | null;
  host: INodeAgentHostDto | null;
  /** В выпуске есть другая версия под этот узел. */
  updateAvailable: boolean;
  /** Воркеры: имя, состояние, версия, самочувствие. */
  workers: INodeAgentWorkerDto[];
}

/** Воркер агента узла кратко. */
export interface INodeAgentWorkerDto {
  name: string;
  /** `starting` | `running` | `invalid` | `backoff` | `stopped`. */
  state: string | null;
  version: string | null;
  /** Последний ответ `GET /health`: `ok`; нет ответа — `null`. */
  healthy: boolean | null;
  /** Идёт долгая работа. */
  busy: boolean;
}

/** Сводка настроек воркеров агента (ключи `воркер/ключ`). */
export interface INodeConfigDto {
  status: ENodeConfigStatus;
  /** Ключи, где заданная версия ещё не применена. */
  pending: string[];
  /** Ключи, где воркер отказал. */
  failed: string[];
}

/** Последняя задача установки или удаления агента. */
export interface INodeJobDto {
  id: string;
  kind: ENodeJobKind;
  status: EJobRunStatus;
  progress: number;
  progressText: string | null;
  error: { code: string; message: string } | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Что нужно DTO узла помимо сущности: агент, задача, вычисленное. */
export interface INodeView {
  agent: AgentDto | null;
  updateAvailable: boolean;
  job: { run: JobRunDto; kind: ENodeJobKind } | null;
  status: INodeStatusResult;
  config: INodeConfigSummary;
}

const agentSummary = (
  agent: AgentDto | null,
  updateAvailable: boolean,
): INodeAgentDto | null => {
  if (!agent) return null;

  const host = agent.host;

  return {
    id: agent.id,
    name: agent.name,
    online: agent.online,
    revoked: agent.revoked,
    version: agent.version ?? null,
    address: agent.address ?? null,
    lastSeenAt: agent.lastSeenAt ?? null,
    host: host
      ? { hostname: host.hostname, os: host.os, arch: host.arch }
      : null,
    updateAvailable,
    workers: agent.workers
      .filter(worker => !worker.builtin)
      .map(worker => ({
        name: worker.name,
        state: worker.state ?? null,
        version: worker.version ?? null,
        healthy: worker.health ? worker.health.ok : null,
        busy: worker.health?.busy === true,
      })),
  };
};

export class NodeDto extends BaseDto {
  id: string;
  name: string;
  description: string | null;
  /** Публичный адрес (имя хоста или IP). */
  host: string | null;
  /** Назначенный владелец. */
  ownerId: string | null;
  ownerName: string | null;
  /** Создатель. */
  createdById: string | null;
  createdByName: string | null;
  agentId: string | null;
  /**
   * Имя агента узла (остаётся и без агента): агент с этим именем,
   * зарегистрированный без метки узла, привязывается к этому узлу.
   */
  agentName: string | null;
  /** Вычисленный статус (см. README модуля). */
  status: ENodeStatus;
  /** Пояснение к статусу. */
  statusMessage: string | null;
  /** Агент узла; `null` — агента нет (или запись агента удалена). */
  agent: INodeAgentDto | null;
  config: INodeConfigDto;
  /** Последняя задача установки или удаления агента. */
  job: INodeJobDto | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: Node, view: INodeView) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.description = entity.description;
    this.host = entity.host;
    this.ownerId = entity.ownerId;
    this.ownerName = userDisplayName(entity.owner);
    this.createdById = entity.createdById;
    this.createdByName = userDisplayName(entity.createdBy);
    this.agentId = entity.agentId;
    this.agentName = entity.agentName;
    this.status = view.status.status;
    this.statusMessage = view.status.message;
    this.agent = agentSummary(view.agent, view.updateAvailable);
    this.config = view.config;
    this.job = view.job
      ? {
          id: view.job.run.id,
          kind: view.job.kind,
          status: view.job.run.status,
          progress: view.job.run.progress,
          progressText: view.job.run.progressText,
          error: view.job.run.error,
          createdAt: view.job.run.createdAt,
          finishedAt: view.job.run.finishedAt,
        }
      : null;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: Node, view: INodeView): NodeDto {
    return new NodeDto(entity, view);
  }
}

/** Краткая запись для выпадающих списков. */
export class NodeOptionDto extends BaseDto {
  id: string;
  name: string;
  host: string | null;
  agentId: string | null;

  constructor(entity: Node) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.host = entity.host;
    this.agentId = entity.agentId;
  }

  static fromEntity(entity: Node): NodeOptionDto {
    return new NodeOptionDto(entity);
  }
}
