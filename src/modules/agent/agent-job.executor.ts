import {
  type Agent,
  type AgentEvent,
  AgentsError,
  JOB_EVENTS,
  type JobResult,
  type JobStatus,
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

/** Ждать итога долгой задачи при запуске не нужно: он придёт событием. */
const RUN_WAIT_MS = 1;
const TEXT_MAX = 200;
const MESSAGE_MAX = 1000;

/** Событие задачи воркера → что случилось с задачей. */
const EVENT_KINDS: Record<string, TExternalJobUpdateKind> = {
  "job.progress": "progress",
  "job.done": "done",
  "job.failed": "failed",
  "job.cancelled": "cancelled",
};

/** Состояние задачи у воркера (`GET /jobs/{id}`, ответ `runJob`). */
const STATE_KINDS: Record<string, TExternalJobUpdateKind> = {
  running: "progress",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
};

/** Ошибки SDK, при которых повтор передачи бессмыслен. */
const FINAL_SDK_ERRORS = new Set([
  "MESSAGE_INVALID",
  "PATH_FORBIDDEN",
  "BODY_TOO_LARGE",
  "JOB_INVALID",
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

/** Ответ `runJob` и `jobStatus` → изменение задачи. */
const resultUpdate = (
  agentId: string,
  worker: string,
  workId: string,
  reply: Pick<JobResult, "state" | "progress" | "result" | "error"> &
    Partial<Pick<JobStatus, "id">>,
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
 * `/jobs` (`runJob`, `jobStatus`, `cancelJob` SDK). Передача: агент на
 * связи, у которого воркер объявил тип задачи (`manifest.jobs`); свободные
 * (не `busy`) — первыми. С пересылкой между копиями (`relay`) подходит агент
 * любой копии, без неё — только на связи с этим процессом. Быстрая задача —
 * итог в ответе, долгая — `202 { id }`, ход и итог — события `job.*` (в
 * `onEvent` SDK, до подтверждения агенту).
 */
@Injectable()
export class AgentJobExecutor implements IExternalJobExecutor {
  private readonly _listeners = new Set<
    (update: ExternalJobUpdate) => Promise<void>
  >();

  constructor(@inject(AgentRuntime) private readonly _runtime: AgentRuntime) {
    this._runtime.onWorkerEvent(event => this.onEvent(event));
  }

  /**
   * Соединения агентов — у процессов с HTTP (`api`, `all`); с пересылкой
   * передавать может и процесс без них.
   */
  get canDispatch(): boolean {
    return this._runtime.hasConnections || this._runtime.relayEnabled;
  }

  async dispatch(job: ExternalJobDispatch): Promise<ExternalJobUpdate> {
    const { agentId, worker } = await this.pick(job.target);
    const reply = await this.request(() =>
      this._runtime.agents.runJob(agentId, worker, {
        type: job.target.type,
        jobId: job.jobId,
        data: job.data,
        ...(job.files && { files: job.files }),
        timeoutMs: RUN_WAIT_MS,
      }),
    );

    return resultUpdate(agentId, worker, reply.id ?? job.jobId, reply);
  }

  async poll(
    assignment: ExternalJobAssignment,
  ): Promise<ExternalJobUpdate | null> {
    try {
      const status = await this.request(() =>
        this._runtime.agents.jobStatus(
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

  async cancel(assignment: ExternalJobAssignment): Promise<void> {
    try {
      await this._runtime.agents.cancelJob(
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

  /**
   * Агент и воркер для задачи: на связи, воркер объявил тип; свободные —
   * первыми. Без пересылки — только агенты этого процесса (у другого —
   * повтор позже); нет подходящих — тоже повтор.
   */
  private async pick(
    target: ExternalJobTarget,
  ): Promise<{ agentId: string; worker: string }> {
    const agents = (await this._runtime.agents.listAgents()).filter(
      agent => agent.online && !agent.revoked,
    );
    const candidates = agents.flatMap(agent =>
      workersFor(agent, target).map(worker => ({ agent, worker })),
    );
    const reachable = this._runtime.relayEnabled
      ? candidates
      : candidates.filter(c => this._runtime.isLocal(c.agent));

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

    return { agentId: chosen.agent.id, worker: chosen.worker };
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
