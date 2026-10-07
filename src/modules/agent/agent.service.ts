import { inject } from "inversify";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  JobQueue,
  logger,
  normalizePagination,
  tokenHashMatches,
  toPage,
} from "../../core";
import { agentConfig } from "./agent.config";
import { Agent } from "./agent.entity";
import { AgentError } from "./agent.errors";
import { AgentRepository } from "./agent.repository";
import {
  AGENT_LINK_LOST_QUEUE,
  AGENT_MISSED_STATUS_LIMIT,
  AGENT_SESSION_CHANNEL,
  EAgentStatus,
  EAgentTransport,
} from "./agent.types";
import { parseAgentCredentials } from "./agent-credentials";
import type { IAgentLinkLostData } from "./agent-jobs";
import type { TAlpHello } from "./agent-link.protocol";
import { AgentPresenceStore } from "./agent-presence.store";
import { AgentSignals } from "./agent-signals";
import { AgentDto } from "./dto";
import {
  AgentCapabilitiesChangedEvent,
  AgentOfflineEvent,
  AgentOnlineEvent,
  AgentRevokedEvent,
} from "./events";

/** Сколько агентов без пульса обрабатывается за проход. */
const SWEEP_BATCH = 100;

/** Сведения о новой сессии агента. */
export interface IAgentSessionOpen {
  sessionId: string;
  transport: EAgentTransport;
  hello: TAlpHello;
  protocol: number;
  remoteIp: string | undefined;
}

/** Payload сигнала смены сессии: `<agentId>:<sessionId>` или `<agentId>:revoked`. */
export const AGENT_REVOKED_SESSION = "revoked";

/**
 * Реестр агентов: учётные данные, сессии и присутствие. Присутствие — в БД
 * (`status`, `lastSeenAt`) для списков и в Redis (живое состояние).
 */
@Injectable()
export class AgentService {
  constructor(
    @inject(AgentRepository) private readonly _agents: AgentRepository,
    @inject(AgentPresenceStore) private readonly _presence: AgentPresenceStore,
    @inject(AgentSignals) private readonly _signals: AgentSignals,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(JobQueue) private readonly _jobs: JobQueue,
  ) {}

  /**
   * Сессия закрылась: если за время ожидания агент не вернётся (новая сессия
   * или пульс), он offline. Проверка — отложенной задачей очереди.
   */
  async scheduleOfflineCheck(
    agentId: string,
    sessionId: string,
  ): Promise<void> {
    try {
      await this._jobs.enqueue<IAgentLinkLostData>(
        AGENT_LINK_LOST_QUEUE,
        { agentId, sessionId, disconnectedAt: new Date().toISOString() },
        { startAfter: agentConfig.offlineGraceSec },
      );
    } catch (err) {
      logger.warn({ err, agentId }, "[Agent] Проверка offline не поставлена");
    }
  }

  /** Действующий агент по учётным данным `<agentId>.<secret>` или 401. */
  async authenticate(raw: string): Promise<Agent> {
    const parsed = parseAgentCredentials(raw);
    const agent = parsed ? await this._agents.findById(parsed.agentId) : null;

    if (
      !parsed ||
      !agent ||
      agent.revokedAt ||
      !tokenHashMatches(parsed.secret, agent.secretHash)
    ) {
      throw AgentError.CREDENTIALS_INVALID();
    }

    return agent;
  }

  async list(
    status?: EAgentStatus,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<AgentDto>> {
    const page = normalizePagination(offset, limit);
    const [agents, total] = await this._agents.findPage({
      status,
      offset: page.offset,
      limit: page.limit,
    });

    return toPage(
      agents.map(agent => AgentDto.fromEntity(agent)),
      total,
      page,
    );
  }

  /** Агент с живым состоянием (последний `status` и `metrics`). */
  async get(id: string): Promise<AgentDto> {
    const agent = await this._agents.findById(id);

    if (!agent) throw AgentError.NOT_FOUND();

    const [status, metrics] = await Promise.all([
      this._presence.getStatus(id),
      this._presence.getMetrics(id),
    ]);

    return AgentDto.fromEntity(agent, { status, metrics });
  }

  /** Агент без живого состояния (для событий списка). */
  async getSummary(id: string): Promise<AgentDto> {
    const agent = await this._agents.findById(id);

    if (!agent) throw AgentError.NOT_FOUND();

    return AgentDto.fromEntity(agent);
  }

  /** Действующий (не отозванный) агент или 401. */
  async findActive(id: string): Promise<Agent> {
    const agent = await this._agents.findById(id);

    if (!agent || agent.revokedAt) throw AgentError.CREDENTIALS_INVALID();

    return agent;
  }

  findById(id: string): Promise<Agent | null> {
    return this._agents.findById(id);
  }

  /** Из `ids` — агенты, которые больше не действуют (отозваны или удалены). */
  async findInactive(ids: string[]): Promise<string[]> {
    const alive = new Set(
      (await this._agents.findByIds(ids))
        .filter(agent => !agent.revokedAt)
        .map(agent => agent.id),
    );

    return ids.filter(id => !alive.has(id));
  }

  /**
   * Новая сессия: агент на связи, сведения из `hello` сохранены. Сессии того
   * же агента в других процессах закрываются по сигналу.
   */
  async openSession(agent: Agent, open: IAgentSessionOpen): Promise<void> {
    const now = new Date();
    const { hello } = open;
    const patch = {
      status: EAgentStatus.ONLINE,
      sessionId: open.sessionId,
      transport: open.transport,
      version: hello.agent.version,
      protocol: open.protocol,
      host: hello.host,
      capabilities: hello.capabilities,
      labels: { ...agent.labels, ...hello.labels },
      remoteIp: open.remoteIp ?? null,
      connectedAt: now,
      lastSeenAt: now,
    };

    await this._agents.update({ id: agent.id }, patch);
    Object.assign(agent, patch);
    await this._signals.notify(
      AGENT_SESSION_CHANNEL,
      `${agent.id}:${open.sessionId}`,
    );
    this._eventBus.emit(new AgentOnlineEvent(agent.id, open.sessionId));
  }

  /**
   * Ёмкость очередей агента изменилась (нагрузка зарегистрировалась или
   * перезапустилась после `hello`): обновить возможности в БД.
   */
  async updateJobsCapacity(
    agent: Agent,
    capacity: Record<string, number>,
  ): Promise<void> {
    const queues = Object.entries(capacity)
      .map(([name, concurrency]) => ({ name, concurrency }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const current = agent.capabilities.jobs?.queues ?? [];

    if (JSON.stringify(current) === JSON.stringify(queues)) return;

    const capabilities = { ...agent.capabilities, jobs: { queues } };

    await this._agents.update({ id: agent.id }, { capabilities });
    agent.capabilities = capabilities;
    this._eventBus.emit(new AgentCapabilitiesChangedEvent(agent.id));
  }

  /**
   * Пульс сессии: `lastSeenAt`. `false` — сессия больше не текущая (её
   * вытеснила новая или агент отозван).
   */
  async touch(agentId: string, sessionId: string): Promise<boolean> {
    const { affected } = await this._agents.update(
      { id: agentId, sessionId },
      { lastSeenAt: new Date(), status: EAgentStatus.ONLINE },
    );

    return (affected ?? 0) > 0;
  }

  /**
   * Сессия закрылась `before` и с тех пор агент не появлялся — offline.
   * Новая сессия (другой `sessionId`) отметку не снимает.
   */
  async markOfflineIfSilent(
    agentId: string,
    sessionId: string | null,
    before: Date,
  ): Promise<boolean> {
    if (!(await this._agents.markOffline(agentId, sessionId, before))) {
      return false;
    }

    await this._presence
      .clear(agentId)
      .catch(err =>
        logger.warn({ err, agentId }, "[Agent] Живое состояние не очищено"),
      );
    this._eventBus.emit(new AgentOfflineEvent(agentId));

    return true;
  }

  /** Агенты на связи без пульса дольше нескольких интервалов статуса — offline. */
  async sweepSilent(): Promise<number> {
    const before = new Date(
      Date.now() - agentConfig.statusIntervalMs * AGENT_MISSED_STATUS_LIMIT,
    );
    const silent = await this._agents.findSilent(before, SWEEP_BATCH);
    let count = 0;

    for (const agent of silent) {
      if (await this.markOfflineIfSilent(agent.id, null, before)) count += 1;
    }

    return count;
  }

  /** Отозвать агента: сессия закрывается (4401), учётные данные недействительны. */
  async revoke(id: string, revokedBy?: string): Promise<void> {
    const agent = await this._agents.findById(id);

    if (!agent) throw AgentError.NOT_FOUND();
    if (agent.revokedAt) return;

    await this._agents.update(
      { id },
      { revokedAt: new Date(), status: EAgentStatus.OFFLINE, sessionId: null },
    );
    await this._presence.clear(id);
    await this._signals.notify(
      AGENT_SESSION_CHANNEL,
      `${id}:${AGENT_REVOKED_SESSION}`,
    );
    this._eventBus.emit(new AgentRevokedEvent(id, revokedBy));
  }

  /** Забыть эфемерных агентов, пропавших до `before`. */
  forgetEphemeral(before: Date): Promise<number> {
    return this._agents.deleteForgottenEphemeral(before);
  }
}
