import {
  type Agents,
  AgentsError,
  type ErrorInfo,
  type JobState,
} from "agent-sdk/server";

/** Задачи воркера — маршрут `/jobs` (спецификация агента, §12). */
const JOBS_PATH = "/jobs";

/** Срок ответа на `POST /jobs`: не меньше 30 с и не больше срока запроса к воркеру (10 мин). */
const START_TIMEOUT = { minMs: 30_000, maxMs: 600_000 };

const JOB_STATES = new Set<string>(["running", "done", "failed", "cancelled"]);

/** Задача воркеру: тип из `manifest.jobs`, id записи, данные и ссылки на файлы. */
export interface IAgentJobStart {
  type: string;
  jobId: string;
  data?: unknown;
  files?: {
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
  };
}

/**
 * Состояние задачи у воркера: ответ на запуск (быстрая — `done` с итогом,
 * долгая — `running` с `id`), на `GET /jobs/{id}` и на отмену.
 */
export interface IAgentJobReply {
  /** id долгой задачи у воркера; у быстрой — нет. */
  id?: string;
  state: JobState;
  progress?: number;
  result?: unknown;
  error?: ErrorInfo;
}

type TRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Тело ответа воркера: JSON и текст (не JSON — `json` нет). */
const readBody = async (
  res: Response,
): Promise<{ json?: unknown; text: string }> => {
  const text = await res.text();

  try {
    return { json: text ? JSON.parse(text) : undefined, text };
  } catch {
    return { text };
  }
};

/**
 * Отказ воркера: 404 на запрос задачи по id — `JOB_NOT_FOUND`, другой 4xx —
 * `JOB_REJECTED` с его статусом, остальное — `JOB_REJECTED` 502.
 */
const rejection = async (
  res: Response,
  byId: boolean,
): Promise<AgentsError> => {
  const { json, text } = await readBody(res);
  const reason = isRecord(json) ? json.message : undefined;
  const message = `воркер ответил ${res.status}: ${String(reason ?? text)}`;

  if (byId && res.status === 404) {
    return new AgentsError("JOB_NOT_FOUND", message, 404);
  }

  return new AgentsError(
    "JOB_REJECTED",
    message,
    res.status >= 400 && res.status < 500 ? res.status : 502,
  );
};

const malformed = (what: string): AgentsError =>
  new AgentsError(
    "JOB_REJECTED",
    `воркер ответил не по стандарту: ${what}`,
    502,
  );

const errorOf = (value: unknown): ErrorInfo | undefined =>
  isRecord(value) &&
  typeof value.code === "string" &&
  typeof value.message === "string"
    ? { code: value.code, message: value.message }
    : undefined;

/** Ответ `GET /jobs/{id}` и `POST /jobs/{id}/cancel`: `{ id, state, … }`. */
const statusOf = (json: unknown): IAgentJobReply => {
  if (
    !isRecord(json) ||
    typeof json.id !== "string" ||
    typeof json.state !== "string" ||
    !JOB_STATES.has(json.state)
  ) {
    throw malformed("нужно { id, state }");
  }
  const error = errorOf(json.error);

  return {
    id: json.id,
    state: json.state as JobState,
    ...(typeof json.progress === "number" && { progress: json.progress }),
    ...("result" in json && { result: json.result }),
    ...(error && { error }),
  };
};

const jobPath = (id: string): string => {
  if (!id || /[/\r\n?#]/.test(id)) {
    throw new AgentsError(
      "MESSAGE_INVALID",
      "id задачи — один сегмент пути",
      400,
    );
  }

  return `${JOBS_PATH}/${encodeURIComponent(id)}`;
};

/**
 * Запустить задачу: `POST /jobs`. `200 { result }` — быстрая, итог сразу
 * (`done`); `202 { id }` — долгая (`running`), ход и итог придут событиями
 * `job.*`. Отказ воркера — `JOB_REJECTED`; тип не из манифеста —
 * `JOB_UNKNOWN` (от агента). `timeoutMs` — сколько ждать ответа (не меньше
 * 30 с, не больше 10 мин).
 */
export const startAgentJob = async (
  agents: Agents,
  agentId: string,
  worker: string,
  job: IAgentJobStart,
  timeoutMs = START_TIMEOUT.minMs,
): Promise<IAgentJobReply> => {
  const res = await agents.fetch(agentId, worker, JOBS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: job.type,
      jobId: job.jobId,
      ...(job.data !== undefined && { data: job.data }),
      ...(job.files && { files: job.files }),
    }),
    timeoutMs: Math.min(
      Math.max(timeoutMs, START_TIMEOUT.minMs),
      START_TIMEOUT.maxMs,
    ),
  });

  if (res.status < 200 || res.status > 299) throw await rejection(res, false);

  const { json } = await readBody(res);

  if (res.status !== 202) {
    return {
      state: "done",
      ...(isRecord(json) && "result" in json && { result: json.result }),
    };
  }
  if (!isRecord(json) || typeof json.id !== "string" || !json.id) {
    throw malformed("202 без id задачи");
  }

  return { id: json.id, state: "running" };
};

/** Состояние задачи: `GET /jobs/{id}`; задачи нет — `JOB_NOT_FOUND`. */
export const agentJobStatus = async (
  agents: Agents,
  agentId: string,
  worker: string,
  id: string,
): Promise<IAgentJobReply> => {
  const res = await agents.fetch(agentId, worker, jobPath(id), {
    method: "GET",
  });

  if (res.status < 200 || res.status > 299) throw await rejection(res, true);

  return statusOf((await readBody(res)).json);
};

/** Отменить задачу: `POST /jobs/{id}/cancel`; задачи нет — `JOB_NOT_FOUND`. */
export const cancelAgentJob = async (
  agents: Agents,
  agentId: string,
  worker: string,
  id: string,
): Promise<IAgentJobReply> => {
  const res = await agents.fetch(agentId, worker, `${jobPath(id)}/cancel`, {
    method: "POST",
  });

  if (res.status < 200 || res.status > 299) throw await rejection(res, true);

  return statusOf((await readBody(res)).json);
};
