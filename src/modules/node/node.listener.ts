import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import {
  AgentAlertChangedEvent,
  AgentConfigChangedEvent,
  AgentDeletedEvent,
  AgentDto,
  AgentEnrolledEvent,
  AgentMetricsReceivedEvent,
  AgentUpdatedEvent,
  type IAgentMetricsPointDto,
} from "../agent";
import { JobUpdatedEvent, SETTLED_JOB_RUN_STATUSES } from "../jobs";
import {
  ISocketEventListener,
  OwnedEntityEmitter,
  SocketEmitterService,
} from "../socket";
import type { INodeLoadDto } from "./dto";
import { NodeCreatedEvent, NodeDeletedEvent, NodeUpdatedEvent } from "./events";
import { NodePermissions } from "./node.permissions";
import { NodeRepository } from "./node.repository";
import { NodeService } from "./node.service";
import {
  NODE_JOB_KINDS,
  NODE_JOB_SCOPE,
  NODE_LOAD_EMIT_MS,
  nodeRoom,
  NODES_ROOM,
} from "./node.types";
import { NodeAgentService } from "./node-agent.service";

/** Что в агенте влияет на узел: связь, версия, адрес, воркеры. */
const agentSignature = (agent: AgentDto): string =>
  JSON.stringify([
    agent.online,
    agent.revoked,
    agent.version,
    agent.address,
    agent.host,
    agent.workers.map(worker => [
      worker.name,
      worker.state,
      worker.message,
      worker.version,
      worker.health?.ok,
      worker.health?.busy,
      worker.health?.message,
      worker.configs,
    ]),
  ]);

/**
 * Узлы → сокет и реакции на агентов и задачи. Изменение узла уходит в
 * комнату списка (`nodes`, право на все узлы), в комнату узла и лично
 * своим (владелец и создатель с областью «свои»); прежний владелец получает
 * `node:deleted`. Регистрация агента привязывает его к узлу (или создаёт
 * узел), отзыв и удаление — отвязывают. Изменения агента (связь, воркеры),
 * его проблем и статусов настроек, переходы задач установки — новый
 * `node:updated`. Метрики агента — нагрузка узла `node:load` (не чаще
 * раза в 5 с на узел) в комнаты и своим.
 */
@Injectable()
export class NodeListener implements ISocketEventListener {
  /** Последний отправленный вид агента — изменения без значения не шлются. */
  private readonly _agentSignatures = new Map<string, string>();
  /** Последний статус задачи узла — прогресс без смены статуса не шлётся. */
  private readonly _jobStatuses = new Map<string, string>();
  /** Когда нагрузка агента последний раз ушла в сокет, мс. */
  private readonly _loadSentAt = new Map<string, number>();
  /** Агенты, чей адрес уже переносился в узел (адрес узла — один раз за процесс). */
  private readonly _hostChecked = new Set<string>();

  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(OwnedEntityEmitter) private readonly _owned: OwnedEntityEmitter,
    @inject(NodeService) private readonly _nodes: NodeService,
    @inject(NodeRepository) private readonly _repo: NodeRepository,
    @inject(NodeAgentService) private readonly _nodeAgents: NodeAgentService,
  ) {}

  register(): void {
    const on = this._eventBus.on.bind(this._eventBus);

    on(NodeCreatedEvent, async ({ nodeId }) => {
      await this._send(nodeId);
    });
    on(NodeUpdatedEvent, async ({ nodeId, previousOwnerId }) => {
      const node = await this._send(nodeId);

      if (previousOwnerId && previousOwnerId !== node?.createdById) {
        await this._owned.detach(previousOwnerId, "node:deleted", {
          id: nodeId,
        });
      }
    });
    on(NodeDeletedEvent, ({ nodeId, ownerId, createdById }) => {
      const payload = { id: nodeId };

      this._emitter.toRooms(
        [NODES_ROOM, nodeRoom(nodeId)],
        "node:deleted",
        payload,
      );

      return this._owned.toOwners(
        [ownerId, createdById],
        NodePermissions.VIEW,
        "node:deleted",
        payload,
      );
    });
    on(AgentEnrolledEvent, ({ agent, source }) =>
      this._nodeAgents.onEnrolled(agent, source),
    );
    on(AgentDeletedEvent, ({ agentId }) => {
      this._agentSignatures.delete(agentId);
      this._hostChecked.delete(agentId);
      this._loadSentAt.delete(agentId);

      return this._nodeAgents.onAgentGone(agentId);
    });
    on(AgentUpdatedEvent, async ({ agent }) => {
      if (agent.revoked) return this._nodeAgents.onAgentGone(agent.id);
      if (agent.address && !this._hostChecked.has(agent.id)) {
        this._hostChecked.add(agent.id);
        await this._nodeAgents.fillHost(agent);
      }

      const signature = agentSignature(agent);

      if (this._agentSignatures.get(agent.id) === signature) return;
      this._agentSignatures.set(agent.id, signature);

      return this._sendByAgent(agent.id);
    });
    on(AgentAlertChangedEvent, ({ alert }) => this._sendByAgent(alert.agentId));
    on(AgentConfigChangedEvent, ({ status }) =>
      this._sendByAgent(status.agentId),
    );
    on(AgentMetricsReceivedEvent, ({ agentId, point }) =>
      this._sendLoad(agentId, point),
    );
    on(JobUpdatedEvent, async ({ job }) => {
      if (
        job.scopeType !== NODE_JOB_SCOPE ||
        !job.scopeId ||
        !(job.queue in NODE_JOB_KINDS) ||
        this._jobStatuses.get(job.id) === job.status
      ) {
        return;
      }

      if (SETTLED_JOB_RUN_STATUSES.includes(job.status)) {
        this._jobStatuses.delete(job.id);
      } else {
        this._jobStatuses.set(job.id, job.status);
      }
      await this._send(job.scopeId);
    });
  }

  /** DTO узла — в комнаты и своим; узла нет — ничего. */
  private async _send(nodeId: string) {
    const node = await this._nodes.findDto(nodeId);

    if (!node) return null;

    this._emitter.toRooms([NODES_ROOM, nodeRoom(nodeId)], "node:updated", node);
    await this._owned.toOwners(
      [node.ownerId, node.createdById],
      NodePermissions.VIEW,
      "node:updated",
      node,
    );

    return node;
  }

  private async _sendByAgent(agentId: string): Promise<void> {
    const node = await this._repo.findByAgentId(agentId);

    if (node) await this._send(node.id);
  }

  /**
   * Нагрузка узла агента — в комнаты и своим, не чаще `NODE_LOAD_EMIT_MS`
   * на агента: метрики узла без метрик воркеров.
   */
  private async _sendLoad(
    agentId: string,
    point: IAgentMetricsPointDto,
  ): Promise<void> {
    const now = Date.now();

    if (!point.host) return;
    if (now - (this._loadSentAt.get(agentId) ?? 0) < NODE_LOAD_EMIT_MS) return;
    this._loadSentAt.set(agentId, now);

    const node = await this._repo.findByAgentId(agentId);

    if (!node) return;

    const load: INodeLoadDto = {
      nodeId: node.id,
      agentId,
      point: { at: point.at, host: point.host },
    };

    this._emitter.toRooms([NODES_ROOM, nodeRoom(node.id)], "node:load", load);
    await this._owned.toOwners(
      [node.ownerId, node.createdById],
      NodePermissions.VIEW,
      "node:load",
      load,
    );
  }
}
