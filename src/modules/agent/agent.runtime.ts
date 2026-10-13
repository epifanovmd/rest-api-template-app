import {
  type ActionRecord,
  type Agent,
  type AgentEvent,
  Agents,
  AgentsError,
  JOB_EVENTS,
  type WorkerRequest,
} from "agent-sdk/server";
import { randomBytes } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { inject } from "inversify";
import { hostname, networkInterfaces } from "os";
import { z } from "zod";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import { agentConfig, bundleReleasesDir } from "./agent.config";
import { AgentSignals } from "./agent.signals";
import { AGENTS_CHANGED_CHANNEL, TAgentActionName } from "./agent.types";
import { agentAlerts, AgentAlertTracker, IAgentAlert } from "./agent-alerts";
import { AgentEnrollmentService } from "./agent-enrollment.service";
import { AgentHistoryService, toAgentEventDto } from "./agent-history.service";
import { schemaProblemsOf } from "./agent-schema";
import { AgentWorkerRequestRegistry } from "./agent-worker-request.registry";
import {
  AgentAlertDto,
  AgentConfigStatusDto,
  AgentDto,
  toMetricsPointDto,
} from "./dto";
import {
  AgentActionAuditedEvent,
  AgentActionFinishedEvent,
  AgentAlertChangedEvent,
  AgentConfigChangedEvent,
  AgentDeletedEvent,
  AgentEnrolledEvent,
  AgentEventReceivedEvent,
  AgentLogReceivedEvent,
  AgentMetricsReceivedEvent,
  AgentUpdatedEvent,
} from "./events";
import { AgentStore } from "./store/agent.store";

/** Изменения копятся столько перед NOTIFY и перед refresh. */
const COALESCE_MS = 100;
/** Больше агентов в одном сигнале — «обновить всех» (предел NOTIFY — 8000 байт). */
const MAX_SIGNAL_IDS = 100;
/** Сигнал другим процессам: кого перечитать. */
const ChangeSignalSchema = z.object({
  from: z.string(),
  all: z.boolean(),
  ids: z.array(z.string()).max(MAX_SIGNAL_IDS),
});

type TChangeSignal = z.infer<typeof ChangeSignalSchema>;

/** Накопленные изменения: все агенты или перечисленные. */
class PendingChanges {
  all = false;
  readonly ids = new Set<string>();

  add(agentId: string | undefined): void {
    if (agentId) this.ids.add(agentId);
    else this.all = true;
  }

  take(): { all: boolean; ids: string[] } {
    const taken = {
      all: this.all || this.ids.size > MAX_SIGNAL_IDS,
      ids: [...this.ids],
    };

    this.all = false;
    this.ids.clear();

    return taken;
  }
}

const parseJson = <T>(schema: z.ZodType<T>, payload: string): T | null => {
  try {
    const parsed = schema.safeParse(JSON.parse(payload));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Адреса «на все интерфейсы»: копию по ним не найти. */
const ANY_HOSTS = new Set(["", "0.0.0.0", "::", "[::]"]);

/** IPv4 машины (первый внешний интерфейс); нет — 127.0.0.1. */
const machineIpv4 = (): string =>
  Object.values(networkInterfaces())
    .flat()
    .find(net => net?.family === "IPv4" && !net.internal)?.address ??
  "127.0.0.1";

/** `http://host:port`; адрес «на все интерфейсы» — IPv4 машины. */
const urlOf = (host: string, port: number): string => {
  const reachable = ANY_HOSTS.has(host) ? machineIpv4() : host;

  return `http://${reachable.includes(":") ? `[${reachable}]` : reachable}:${port}`;
};

/**
 * Имя копии в `agent.session.instance` — адрес её API (уникален среди
 * копий). Без HTTP (роль `worker`) соединений агентов нет — узнаваемое
 * уникальное имя.
 */
const newInstanceId = (): string =>
  config.app.role === "worker"
    ? `worker:${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`
    : urlOf(config.server.host, config.server.port);

/** Действие агента до итога: агент, имя и воркер (`args.name`). */
const actionKey = (agentId: string, name: string, worker: unknown): string =>
  `${agentId}\n${name}\n${typeof worker === "string" ? worker : ""}`;

/** id отложенного действия (`{ deferred: true, actionId }`) из итога вызова. */
const deferredActionId = (result: unknown): string | undefined =>
  !!result &&
  typeof result === "object" &&
  "deferred" in result &&
  result.deferred === true &&
  "actionId" in result &&
  typeof result.actionId === "string"
    ? result.actionId
    : undefined;

/** Отказ SDK до отправки агенту: агента нет, он не на связи с этим процессом, неверный вызов. */
const NOT_SENT_CODES = new Set([
  "AGENT_NOT_FOUND",
  "AGENT_REVOKED",
  "AGENT_OFFLINE",
  "AGENT_ELSEWHERE",
  "MESSAGE_INVALID",
  "WORKER_UNKNOWN",
  "WORKER_NOT_RELEASED",
  "UPDATE_NOT_AVAILABLE",
]);

const isNotSent = (err: unknown): boolean =>
  err instanceof AgentsError && NOT_SENT_CODES.has(err.code);

type TWorkerEventHandler = (event: AgentEvent) => Promise<void>;

/**
 * `Agents` из agent-sdk — один на процесс: регистрация, WebSocket агентов,
 * запросы к воркерам, настройки, наблюдение, действия, раздача сборок
 * воркеров проекта. Хранилище — Postgres (`AgentStore`). События SDK уходят
 * в EventBus; история (события воркеров, метрики) — в свои таблицы. Изменения
 * в Store, которые должен доставить процесс с соединением агента, — сигналом
 * `agents_changed` (каждый процесс вызывает `refresh`). Вызовы, которым нужна
 * копия с соединением агента (запрос к воркеру, задачи, действия,
 * наблюдение), выполняет только она: в другой копии — `AGENT_ELSEWHERE`
 * (клиенту — 503 и `Retry-After`). Проверка по схемам манифеста воркеров,
 * проблемы агентов и аудит действий — здесь же, не в SDK.
 */
@Injectable()
export class AgentRuntime {
  private _agents: Agents | null = null;
  private readonly _instanceId = newInstanceId();
  private readonly _outgoing = new PendingChanges();
  private readonly _incoming = new PendingChanges();
  private _outgoingTimer: NodeJS.Timeout | null = null;
  private _incomingTimer: NodeJS.Timeout | null = null;
  private _started = false;
  private readonly _eventHandlers = new Set<TWorkerEventHandler>();
  private readonly _reconnectHandlers = new Set<(agentId: string) => void>();
  /** Время подключения агента, о котором уже сообщили, — по сессиям этого процесса. */
  private readonly _connectedAt = new Map<string, number>();
  /** Воркеры агента в работе: «имя → перезапуски», — чтобы заметить их перезапуск. */
  private readonly _running = new Map<string, Map<string, number>>();
  /** Проблемы агентов, о которых этот процесс уже сообщил. */
  private readonly _alerts = new AgentAlertTracker();
  /** Изменения агента — по порядку: событие агента и его проблемы. */
  private readonly _agentQueue = new Map<string, Promise<void>>();
  /** Кто вызвал действие, которое ещё не закончилось: ключ действия → пользователь. */
  private readonly _actionActors = new Map<string, string>();

  constructor(
    @inject(AgentStore) private readonly _store: AgentStore,
    @inject(AgentEnrollmentService)
    private readonly _enrollment: AgentEnrollmentService,
    @inject(AgentHistoryService) private readonly _history: AgentHistoryService,
    @inject(AgentSignals) private readonly _signals: AgentSignals,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(AgentWorkerRequestRegistry)
    private readonly _requests: AgentWorkerRequestRegistry,
  ) {}

  /** `Agents` процесса; создаётся при первом обращении. */
  get agents(): Agents {
    this._agents ??= this.create();

    return this._agents;
  }

  get instanceId(): string {
    return this._instanceId;
  }

  /** Процесс держит соединения агентов (роли с HTTP). */
  get hasConnections(): boolean {
    return config.app.role !== "worker";
  }

  /** Соединение агента — в этом процессе. */
  isLocal(agent: Pick<Agent, "online" | "session">): boolean {
    return agent.online && agent.session?.instance === this._instanceId;
  }

  /**
   * HTTP-запрос агента (регистрация, сборки воркеров проекта): в контексте
   * регистрации, чтобы новый агент получил событие `AgentEnrolledEvent` с
   * источником.
   */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    return this._enrollment.withContext(() => this.agents.handle(req, res));
  }

  /**
   * Обработчик событий воркеров: вызывается до сохранения события и до
   * подтверждения агенту; ошибка — агент пришлёт событие снова.
   */
  onWorkerEvent(handler: TWorkerEventHandler): () => void {
    this._eventHandlers.add(handler);

    return () => this._eventHandlers.delete(handler);
  }

  /**
   * Агент (снова) подключился к этому процессу или его воркер запустился
   * заново: работы воркеров пора сверить.
   */
  onReconnect(handler: (agentId: string) => void): () => void {
    this._reconnectHandlers.add(handler);

    return () => this._reconnectHandlers.delete(handler);
  }

  /**
   * Аудит вызова от имени пользователя (`actorId`; пусто — система):
   * `AgentActionAuditedEvent`, цель — воркер из `details.worker` или агент.
   */
  audit(
    actorId: string | null,
    action: string,
    agentId: string,
    details: Record<string, unknown> = {},
  ): void {
    this._eventBus.emit(
      new AgentActionAuditedEvent(
        action,
        actorId || null,
        String(details.worker ?? agentId),
        agentId,
        details,
      ),
    );
  }

  /**
   * Действие агента от имени пользователя: аудит (`name`, аргументы) — если
   * действие ушло агенту, и автор итога (`AgentActionFinishedEvent.action.actor`),
   * в том числе отложенного (`deferred` с `actionId`).
   */
  async action<T>(
    actorId: string,
    agentId: string,
    name: TAgentActionName,
    args: Record<string, unknown> | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    const key = actionKey(agentId, name, args?.name);

    if (actorId) this._actionActors.set(key, actorId);
    try {
      const result = await run();
      const actionId = deferredActionId(result);

      if (actorId && actionId) this._actionActors.set(actionId, actorId);
      this.audit(actorId, name, agentId, args);

      return result;
    } catch (err) {
      if (!isNotSent(err)) this.audit(actorId, name, agentId, args);
      throw err;
    } finally {
      if (actorId && this._actionActors.get(key) === actorId) {
        this._actionActors.delete(key);
      }
    }
  }

  /** Текущие проблемы агента: из его записи и статусов настроек. */
  async alertsOf(agent: Agent): Promise<IAgentAlert[]> {
    const configs = await this.agents.configStatus(agent.id).catch(() => []);

    return agentAlerts(agent, configs, this._alerts.known(agent.id));
  }

  /** Агент для API и событий: с текущими проблемами. */
  async toDto(agent: Agent): Promise<AgentDto> {
    return AgentDto.fromModel(agent, await this.alertsOf(agent));
  }

  /** События SDK → EventBus и история; сигналы между процессами. */
  async start(): Promise<void> {
    if (this._started) return;

    this._started = true;
    this.bridge(this.agents);
    this.share(this.agents);
    this._signals.on(AGENTS_CHANGED_CHANNEL, payload =>
      this.onChanged(payload),
    );
    await this._signals.start();
  }

  /** Соединениям — 1012 (агенты переподключатся к другому процессу). */
  async stop(): Promise<void> {
    if (this._outgoingTimer) clearTimeout(this._outgoingTimer);
    if (this._incomingTimer) clearTimeout(this._incomingTimer);
    this._outgoingTimer = null;
    this._incomingTimer = null;
    await this._agents?.close();
    this._agents?.removeAllListeners();
    this._agents = null;
    this._started = false;
    await this._signals.stop();
  }

  private create(): Agents {
    return new Agents({
      enroll: (token, info) => this._enrollment.enroll(token, info),
      store: this._store,
      instanceId: this._instanceId,
      statusIntervalMs: agentConfig.statusIntervalMs,
      metricsIntervalMs: agentConfig.metricsIntervalMs,
      offlineGraceMs: agentConfig.offlineGraceMs,
      releasesDir: bundleReleasesDir(),
      trustProxy: config.server.trustProxy,
      onEvent: event => this.handleWorkerEvent(event),
      onWorkerRequest: request => this.handleWorkerRequest(request),
      log: (msg, extra) => logger.info({ ...extra }, `[Agent] ${msg}`),
    });
  }

  /**
   * Событие воркера: проверка `data` по схеме манифеста (`validateEvents`),
   * обработчики модулей (задачи), затем история (с замечаниями, если были);
   * новое — в EventBus. Не по схеме: журнал; `reject` — событие только в
   * историю, обработчикам модулей не передаётся. Подтверждение агенту — после
   * успеха.
   */
  private async handleWorkerEvent(event: AgentEvent): Promise<void> {
    const problems = await this.eventProblems(event);
    const rejected =
      problems.length > 0 && agentConfig.validateEvents === "reject";

    if (problems.length) {
      logger.warn(
        {
          agentId: event.agentId,
          worker: event.worker,
          type: event.type,
          problems,
          rejected,
        },
        "[Agent] data события не подходит под схему манифеста воркера",
      );
    }
    if (!rejected) {
      for (const handler of this._eventHandlers) await handler(event);
    }
    if (await this._history.saveEvent(event, problems)) {
      this._eventBus.emit(
        new AgentEventReceivedEvent(toAgentEventDto(event, problems)),
      );
    }
  }

  /** Замечания к `data` события по `events[].schema` (события задач `job.*` — без проверки). */
  private async eventProblems(event: AgentEvent): Promise<string[]> {
    if (
      agentConfig.validateEvents === "off" ||
      (JOB_EVENTS as readonly string[]).includes(event.type)
    ) {
      return [];
    }

    const agent = await this.agents.getAgent(event.agentId);

    return agent
      ? schemaProblemsOf(
          agent,
          event.worker,
          { event: event.type },
          event.data ?? null,
        )
      : [];
  }

  /** Запрос воркера к серверу: `data` по схеме из манифеста, затем обработчик модуля. */
  private async handleWorkerRequest(request: WorkerRequest): Promise<unknown> {
    const agent = await this.agents.getAgent(request.agentId);
    const problems = agent
      ? schemaProblemsOf(
          agent,
          request.worker,
          { request: request.type },
          request.data ?? null,
        )
      : [];

    if (problems.length) {
      throw new AgentsError(
        "REQUEST_INVALID",
        `${request.type}: ${problems.join("; ")}`,
        400,
      );
    }

    return this._requests.handle(request);
  }

  /** События SDK этого процесса → доменные события модуля. */
  private bridge(agents: Agents): void {
    const emit = this._eventBus.emit.bind(this._eventBus);

    agents.on("agent", agent => {
      // Регистрация: SDK сообщает о новом агенте в цепочке запроса enroll.
      const source = this._enrollment.takeSource();

      this.detectReconnect(agent);
      this.serial(agent.id, async () => {
        const alerts = await this.alertsOf(agent);
        const dto = AgentDto.fromModel(agent, alerts);

        emit(new AgentUpdatedEvent(dto));
        if (source) {
          emit(new AgentEnrolledEvent(dto, source));
          this.audit(null, "agent.enroll", agent.id, { name: agent.name });
        }
        this.emitAlerts(agent.id, alerts);
      });
    });
    agents.on("metrics", point => {
      emit(
        new AgentMetricsReceivedEvent(point.agentId, toMetricsPointDto(point)),
      );
      this._history
        .saveMetrics(point)
        .catch(err =>
          logger.warn(
            { err, agentId: point.agentId },
            "[Agent] Точка метрик не сохранена",
          ),
        );
    });
    agents.on("log", ({ agentId, entries }) =>
      emit(new AgentLogReceivedEvent(agentId, entries)),
    );
    agents.on("config", status => {
      emit(new AgentConfigChangedEvent(AgentConfigStatusDto.fromModel(status)));
      this.serial(status.agentId, async () => {
        const agent = await agents.getAgent(status.agentId);

        if (agent) this.emitAlerts(agent.id, await this.alertsOf(agent));
      });
    });
    agents.on("action", action =>
      emit(
        new AgentActionFinishedEvent({
          id: action.id,
          agentId: action.agentId,
          name: action.name,
          ...(action.args && { args: action.args }),
          ...this.actorOf(action),
          status: action.status,
          ...(action.result !== undefined && { result: action.result }),
          ...(action.error && { error: action.error }),
          createdAt: action.createdAt,
          finishedAt: action.finishedAt,
          ...(action.deferred && { deferred: true }),
        }),
      ),
    );
    agents.on("change", ({ agentId, reason }) => {
      if (reason !== "delete") return;
      this._connectedAt.delete(agentId);
      this._running.delete(agentId);
      this.serial(agentId, async () => {
        for (const alert of this._alerts.forget(agentId)) {
          emit(new AgentAlertChangedEvent(AgentAlertDto.fromModel(alert)));
        }
        emit(new AgentDeletedEvent(agentId));
      });
    });
  }

  /** Автор итога действия: вызов от имени пользователя этого процесса. */
  private actorOf(action: ActionRecord): { actor?: string } {
    const byId = this._actionActors.get(action.id);

    if (byId) {
      if (action.deferred) this._actionActors.delete(action.id);

      return { actor: byId };
    }

    const actor = this._actionActors.get(
      actionKey(action.agentId, action.name, action.args?.name),
    );

    return actor ? { actor } : {};
  }

  /** Проблемы агента изменились — `AgentAlertChangedEvent` на каждую. */
  private emitAlerts(agentId: string, alerts: IAgentAlert[]): void {
    for (const alert of this._alerts.update(agentId, alerts)) {
      this._eventBus.emit(
        new AgentAlertChangedEvent(AgentAlertDto.fromModel(alert)),
      );
    }
  }

  /** Работа по агенту — после прежней работы по нему (порядок событий). */
  private serial(agentId: string, run: () => Promise<void>): void {
    const next = (this._agentQueue.get(agentId) ?? Promise.resolve())
      .then(run)
      .catch(err =>
        logger.warn({ err, agentId }, "[Agent] Событие агента не обработано"),
      );

    this._agentQueue.set(agentId, next);
    void next.then(() => {
      if (this._agentQueue.get(agentId) === next) {
        this._agentQueue.delete(agentId);
      }
    });
  }

  /**
   * Агент подключился к этому процессу с новым соединением или его воркер
   * снова зарегистрирован (перезапуск, обновление) — сверка его работ.
   */
  private detectReconnect(agent: Agent): void {
    if (!this.isLocal(agent) || agent.connectedAt === undefined) return;

    const running = new Map(
      agent.workers
        .filter(worker => worker.state === "running")
        .map(worker => [worker.name, worker.restarts ?? 0]),
    );
    const previous = this._running.get(agent.id);
    const restarted =
      !!previous &&
      [...running].some(([name, restarts]) => previous.get(name) !== restarts);
    const reconnected = this._connectedAt.get(agent.id) !== agent.connectedAt;

    this._running.set(agent.id, running);
    if (!reconnected && !restarted) return;

    this._connectedAt.set(agent.id, agent.connectedAt);
    for (const handler of this._reconnectHandlers) {
      try {
        handler(agent.id);
      } catch (err) {
        logger.warn(
          { err, agentId: agent.id },
          "[Agent] Обработчик подключения",
        );
      }
    }
  }

  /** Изменения в Store — сигналом другим процессам (`refresh`). */
  private share(agents: Agents): void {
    agents.on("change", ({ agentId }) => {
      this._outgoing.add(agentId);
      this._outgoingTimer ??= setTimeout(() => this.flush(), COALESCE_MS);
    });
  }

  private flush(): void {
    this._outgoingTimer = null;

    const { all, ids } = this._outgoing.take();
    const signal: TChangeSignal = {
      from: this._instanceId,
      all,
      ids: all ? [] : ids,
    };

    this._signals
      .notify(AGENTS_CHANGED_CHANNEL, JSON.stringify(signal))
      .catch(err =>
        logger.warn({ err }, "[Agent] Сигнал другим процессам не отправлен"),
      );
  }

  private onChanged(payload: string): void {
    const signal = parseJson(ChangeSignalSchema, payload);

    if (!signal || signal.from === this._instanceId || !this._agents) return;

    if (signal.all) this._incoming.add(undefined);
    for (const id of signal.ids) this._incoming.add(id);
    this._incomingTimer ??= setTimeout(() => this.refresh(), COALESCE_MS);
  }

  private refresh(): void {
    this._incomingTimer = null;

    const agents = this._agents;
    const { all, ids } = this._incoming.take();

    if (!agents) return;

    const done = all
      ? agents.refresh()
      : Promise.all(ids.map(id => agents.refresh(id)));

    done.catch(err =>
      logger.warn({ err }, "[Agent] refresh по сигналу не удался"),
    );
  }
}
