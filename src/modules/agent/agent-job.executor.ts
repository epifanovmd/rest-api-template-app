import {
  type Agent,
  type AgentEvent,
  AgentsError,
  JOB_EVENTS,
  workerManifest,
} from "agent-sdk/server";
import { inject } from "inversify";

import {
  ExternalJobAssignment,
  ExternalJobDispatch,
  ExternalJobTarget,
  ExternalJobUpdate,
  IExternalJobExecutor,
  Injectable,
  JobError,
  logger,
  TExternalJobUpdateKind,
} from "../../core";
import { AgentRuntime } from "./agent.runtime";
import { AgentSignals } from "./agent.signals";
import { AGENT_JOB_CONTROL_CHANNEL } from "./agent.types";
import {
  agentJobStatus,
  cancelAgentJob,
  type IAgentJobReply,
  startAgentJob,
} from "./agent-jobs";
import { schemaProblemsOf } from "./agent-schema";

/** Команда задаче воркера процессу с соединением агента (канал `AGENT_JOB_CONTROL_CHANNEL`). */
export interface IAgentJobSignal {
  op: "cancel";
  /** Процесс, которому команда: `instanceId` с соединением агента. */
  instance: string;
  agentId: string;
  worker: string;
  workId: string;
}

const isJobSignal = (v: unknown): v is IAgentJobSignal => {
  const s = v as Partial<IAgentJobSignal> | null;

  return (
    !!s &&
    s.op === "cancel" &&
    [s.instance, s.agentId, s.worker, s.workId].every(
      x => typeof x === "string" && x !== "",
    )
  );
};

const TEXT_MAX = 200;
const MESSAGE_MAX = 1000;

/** Событие задачи воркера → что случилось с задачей. */
const EVENT_KINDS: Record<string, TExternalJobUpdateKind> = {
  "job.progress": "progress",
  "job.done": "done",
  "job.failed": "failed",
  "job.cancelled": "cancelled",
};

/** Состояние задачи у воркера (ответ на запуск и `GET /jobs/{id}`). */
const STATE_KINDS: Record<string, TExternalJobUpdateKind> = {
  running: "progress",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * Ошибки SDK, при которых повтор передачи бессмыслен: неверная задача или
 * воркер её не объявил (`JOB_UNKNOWN` — тип не из `manifest.jobs`,
 * `ROUTE_UNDECLARED` — у воркера нет задач).
 */
const FINAL_SDK_ERRORS = new Set([
  "MESSAGE_INVALID",
  "PATH_FORBIDDEN",
  "BODY_TOO_LARGE",
  "JOB_INVALID",
  "JOB_UNKNOWN",
  "ROUTE_UNDECLARED",
]);

type TRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Ошибка задачи от воркера: код и текст в пределах. */
const failureOf = (
  error: unknown,
): { code: string; message: string } | undefined => {
  if (!isRecord(error)) return undefined;

  return {
    code: str(error.code) ?? "WORKER_FAILED",
    message: (str(error.message) ?? "Воркер не выполнил задачу").slice(
      0,
      MESSAGE_MAX,
    ),
  };
};

/**
 * Изменение задачи: `kind` и данные воркера (`id` — задача у воркера,
 * `jobId` — запись `job_runs`, `progress`, `message`, `result`, `error`).
 */
export const jobUpdate = (
  agentId: string,
  worker: string,
  kind: TExternalJobUpdateKind,
  data: TRecord,
): ExternalJobUpdate | null => {
  const workId = str(data.id);

  if (!workId) return null;

  const progress = num(data.progress);
  const text = str(data.message);
  const error = failureOf(data.error);

  return {
    agentId,
    worker,
    workId,
    kind,
    ...(str(data.jobId) && { jobId: str(data.jobId) }),
    ...(kind === "progress" && progress !== undefined && { progress }),
    ...(kind === "progress" && text && { text: text.slice(0, TEXT_MAX) }),
    ...(kind === "done" && "result" in data && { result: data.result }),
    ...(kind === "failed" && {
      error: error ?? {
        code: "WORKER_FAILED",
        message: "Воркер не выполнил задачу",
      },
    }),
  };
};

/** Событие задачи воркера (`job.progress|done|failed|cancelled`). */
export const eventUpdate = (event: AgentEvent): ExternalJobUpdate | null => {
  const kind = EVENT_KINDS[event.type];

  if (!kind || !isRecord(event.data)) return null;

  return jobUpdate(event.agentId, event.worker, kind, event.data);
};

/** Ответ на запуск и на `GET /jobs/{id}` → изменение задачи. */
const resultUpdate = (
  agentId: string,
  worker: string,
  workId: string,
  reply: IAgentJobReply,
): ExternalJobUpdate =>
  jobUpdate(agentId, worker, STATE_KINDS[reply.state] ?? "progress", {
    ...reply,
    id: workId,
  }) as ExternalJobUpdate;

/** Воркеры агента, объявившие тип задачи в манифесте (`jobs`). */
const workersFor = (agent: Agent, target: ExternalJobTarget): string[] =>
  agent.workers
    .filter(
      worker =>
        worker.state === "running" &&
        (!target.worker || worker.name === target.worker) &&
        !!workerManifest(agent, worker.name)?.jobs?.some(
          job => job.type === target.type,
        ),
    )
    .map(worker => worker.name);

const isBusy = (agent: Agent, worker: string): boolean =>
  agent.workers.some(w => w.name === worker && w.health?.busy === true);

/** Отказ воркера: неверная задача — без повторов; занят, сбой — повтор. */
const isRetryableRejection = (status: number): boolean =>
  status >= 500 || status === 408 || status === 409 || status === 429;

/**
 * Исполнитель внешних очередей на агентах — задачи воркеров по стандарту
 * `/jobs` (`agent-jobs.ts`: `fetch` SDK). Передача: агент на связи с этим
 * процессом, у которого воркер объявил тип задачи (`manifest.jobs`);
 * свободные (не `busy`) — первыми; `data` — по схеме типа из манифеста.
 * Быстрая задача — итог в ответе, долгая — `202 { id }`, ход и итог — события
 * `job.*` (в `onEvent` SDK, до подтверждения агенту).
 */
@Injectable()
export class AgentJobExecutor implements IExternalJobExecutor {
  private readonly _listeners = new Set<
    (update: ExternalJobUpdate) => Promise<void>
  >();

  constructor(
    @inject(AgentRuntime) private readonly _runtime: AgentRuntime,
    @inject(AgentSignals) private readonly _signals: AgentSignals,
  ) {
    this._runtime.onWorkerEvent(event => this.onEvent(event));
    this._signals.on(
      AGENT_JOB_CONTROL_CHANNEL,
      payload => void this.onSignal(payload),
    );
  }

  /** Соединения агентов — у процессов с HTTP (`api`, `all`). */
  get canDispatch(): boolean {
    return this._runtime.hasConnections;
  }

  async dispatch(job: ExternalJobDispatch): Promise<ExternalJobUpdate> {
    const { agent, worker } = await this.pick(job.target);

    this.validate(agent, worker, job);
    // Итог долгой задачи придёт событием: ждать его при запуске не нужно.
    const reply = await this.request(() =>
      startAgentJob(this._runtime.agents, agent.id, worker, {
        type: job.target.type,
        jobId: job.jobId,
        data: job.data,
        ...(job.files && { files: job.files }),
      }),
    );

    return resultUpdate(agent.id, worker, reply.id ?? job.jobId, reply);
  }

  async poll(
    assignment: ExternalJobAssignment,
  ): Promise<ExternalJobUpdate | null> {
    try {
      const status = await this.request(() =>
        agentJobStatus(
          this._runtime.agents,
          assignment.agentId,
          assignment.worker,
          assignment.workId,
        ),
      );

      return resultUpdate(
        assignment.agentId,
        assignment.worker,
        assignment.workId,
        status,
      );
    } catch (err) {
      if (err instanceof JobError && err.code === "JOB_NOT_FOUND") return null;
      throw err;
    }
  }

  /**
   * Отменить задачу у воркера. Соединение агента в другом процессе (например,
   * отмена из роли `worker`) — команда уходит туда сигналом.
   */
  async cancel(assignment: ExternalJobAssignment): Promise<void> {
    if (await this.forwarded("cancel", assignment)) return;
    await this.cancelHere(assignment);
  }

  private async cancelHere(assignment: ExternalJobAssignment): Promise<void> {
    try {
      await cancelAgentJob(
        this._runtime.agents,
        assignment.agentId,
        assignment.worker,
        assignment.workId,
      );
    } catch (err) {
      if (err instanceof AgentsError && err.code === "JOB_NOT_FOUND") return;
      logger.warn(
        { err, agentId: assignment.agentId, workId: assignment.workId },
        "[Agent] Отмена задачи у воркера не удалась",
      );
    }
  }

  /**
   * Агент на связи с другим процессом — отправить ему команду; true — отправлена
   * (здесь выполнять не нужно).
   */
  private async forwarded(
    op: IAgentJobSignal["op"],
    assignment: ExternalJobAssignment,
  ): Promise<boolean> {
    const agent = await this._runtime.agents
      .getAgent(assignment.agentId)
      .catch(() => undefined);
    const instance = agent?.online ? agent.session?.instance : undefined;

    if (!instance || instance === this._runtime.instanceId) return false;
    const signal: IAgentJobSignal = {
      op,
      instance,
      agentId: assignment.agentId,
      worker: assignment.worker,
      workId: assignment.workId,
    };

    await this._signals.notify(
      AGENT_JOB_CONTROL_CHANNEL,
      JSON.stringify(signal),
    );

    return true;
  }

  /** Команда задаче от другого процесса — только процессу, которому она адресована. */
  private async onSignal(payload: string): Promise<void> {
    let signal: unknown;

    try {
      signal = JSON.parse(payload);
    } catch {
      return;
    }
    if (!isJobSignal(signal) || signal.instance !== this._runtime.instanceId)
      return;
    await this.cancelHere(signal);
  }

  onUpdate(listener: (update: ExternalJobUpdate) => Promise<void>): () => void {
    this._listeners.add(listener);

    return () => this._listeners.delete(listener);
  }

  onReconnect(listener: (agentId: string) => void): () => void {
    return this._runtime.onReconnect(listener);
  }

  /** Событие задачи воркера — обработчикам по порядку (до подтверждения). */
  private async onEvent(event: AgentEvent): Promise<void> {
    if (!(JOB_EVENTS as readonly string[]).includes(event.type)) return;

    const update = eventUpdate(event);

    if (!update) return;
    for (const listener of this._listeners) await listener(update);
  }

  /** `data` задачи не по схеме типа из манифеста воркера — `JOB_INVALID` без повторов. */
  private validate(
    agent: Agent,
    worker: string,
    job: ExternalJobDispatch,
  ): void {
    const problems = schemaProblemsOf(
      agent,
      worker,
      { job: job.target.type },
      job.data,
    );

    if (problems.length) {
      throw new JobError(
        "JOB_INVALID",
        `${worker}/${job.target.type}: ${problems.join("; ")}`,
        false,
      );
    }
  }

  /**
   * Агент и воркер для задачи: на связи с этим процессом, воркер объявил
   * тип; свободные — первыми. Подходят только агенты другого процесса —
   * `AGENT_ELSEWHERE` (повтор позже); нет подходящих — `NO_AGENT` (тоже повтор).
   */
  private async pick(
    target: ExternalJobTarget,
  ): Promise<{ agent: Agent; worker: string }> {
    const agents = (await this._runtime.agents.listAgents()).filter(
      agent => agent.online && !agent.revoked,
    );
    const candidates = agents.flatMap(agent =>
      workersFor(agent, target).map(worker => ({ agent, worker })),
    );
    const reachable = candidates.filter(c => this._runtime.isLocal(c.agent));

    if (reachable.length === 0) {
      throw candidates.length > 0
        ? new JobError(
            "AGENT_ELSEWHERE",
            "Подходящие агенты на связи с другим процессом сервера",
          )
        : new JobError(
            "NO_AGENT",
            `Нет агента на связи с воркером, умеющим задачу ${target.type}`,
          );
    }

    const free = reachable.filter(c => !isBusy(c.agent, c.worker));
    const pool = free.length ? free : reachable;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    return { agent: chosen.agent, worker: chosen.worker };
  }

  /** Ошибки SDK → `JobError`: связь и занятый воркер — повтор, неверная задача — нет. */
  private async request<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof AgentsError)) throw err;

      const retryable =
        err.code === "JOB_REJECTED"
          ? isRetryableRejection(err.status)
          : !FINAL_SDK_ERRORS.has(err.code);

      if (err.code !== "JOB_NOT_FOUND") {
        logger.warn(
          { errorCode: err.code, status: err.status },
          `[Agent] Задача воркеру: ${err.message}`,
        );
      }
      throw new JobError(err.code, err.message, retryable);
    }
  }
}
