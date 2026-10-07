import { z } from "zod";

/**
 * ALP v1 — протокол связи агента с бэкендом. Нормативный документ —
 * `protocol/alp/v1/README.md`; здесь — серверная сторона контракта: схемы
 * входящих сообщений (агент → сервер) и типы исходящих (сервер → агент).
 */

/** Версии протокола, которые поддерживает сервер (текущая — последняя). */
export const ALP_PROTOCOLS = [1] as const;
/** Подпротокол WebSocket. */
export const ALP_SUBPROTOCOL = "alp.v1";
/** Путь канала WebSocket. */
export const AGENT_LINK_PATH = "/api/v1/agent-link";

/** Коды закрытия WebSocket (§2.1). */
export enum EAgentLinkClose {
  Normal = 1000,
  Restart = 1012,
  Protocol = 4400,
  Unauthorized = 4401,
  Unsupported = 4409,
  Replaced = 4410,
  Overloaded = 4429,
}

const id = z.string().min(1).max(64);
const uuid = z.uuid();
const attempt = z.number().int().min(0);
const errorCode = z
  .string()
  .max(64)
  .regex(/^[A-Z0-9_]+$/, "Код — заглавные буквы, цифры и _");
const labels = z.record(z.string().max(50), z.string().max(200));

/** Конверт сообщения (§4): поля поверх `data` общие для всех типов. */
export const AlpEnvelopeSchema = z.object({
  type: z.string().min(1).max(50),
  id: id.optional(),
  re: id.optional(),
  seq: z.number().int().min(1).optional(),
  ts: z.number().int().optional(),
  data: z.unknown().optional(),
});

export type TAlpEnvelope = z.infer<typeof AlpEnvelopeSchema>;

// ─── Сессия и состояние ────────────────────────────────────────────────

/** Хост агента (`hello.host`). */
export interface IAlpHost {
  hostname: string;
  os: string;
  arch: string;
  platform?: string;
  kernel?: string;
  cpus?: number;
  memoryBytes?: number;
}

/** Возможности агента (`hello.capabilities`, §6.1). */
export interface IAlpCapabilities {
  jobs?: { queues: { name: string; concurrency: number }[] };
  commands?: { names: string[] };
  /** Домен → применённая версия; `null` — ещё не применялась. */
  state?: { domains: Record<string, number | null> };
  telemetry?: { channels: string[] };
  update?: { mode: "self" | "external" | "disabled" };
}

export const AlpHostSchema: z.ZodType<IAlpHost> = z.object({
  hostname: z.string().max(255),
  os: z.string().max(50),
  arch: z.string().max(50),
  platform: z.string().max(200).optional(),
  kernel: z.string().max(200).optional(),
  cpus: z.number().int().min(0).optional(),
  memoryBytes: z.number().min(0).optional(),
});

export const AlpCapabilitiesSchema: z.ZodType<IAlpCapabilities> = z.object({
  jobs: z
    .object({
      queues: z
        .array(
          z.object({
            name: z.string().min(1).max(100),
            concurrency: z.number().int().min(0).max(1000),
          }),
        )
        .max(100),
    })
    .optional(),
  commands: z
    .object({ names: z.array(z.string().min(1).max(100)).max(200) })
    .optional(),
  state: z
    .object({
      domains: z.record(
        z.string().min(1).max(50),
        z.number().int().min(0).nullable(),
      ),
    })
    .optional(),
  telemetry: z
    .object({ channels: z.array(z.string().min(1).max(50)).max(50) })
    .optional(),
  update: z
    .object({ mode: z.enum(["self", "external", "disabled"]) })
    .optional(),
});

export const AlpHelloSchema = z.object({
  protocols: z.array(z.number().int().min(1)).min(1).max(10),
  agent: z.object({
    name: z.string().min(1).max(200),
    version: z.string().min(1).max(50),
    sdk: z.string().max(50).optional(),
    codeHash: z.string().max(128).optional(),
    bootId: z.string().min(1).max(64),
    startedAt: z.number().int(),
  }),
  host: AlpHostSchema,
  labels: labels.optional(),
  capabilities: AlpCapabilitiesSchema,
  jobs: z
    .array(z.object({ jobId: uuid, attempt }))
    .max(1000)
    .default([]),
});

export type TAlpHello = z.infer<typeof AlpHelloSchema>;

export const AGENT_STATES = [
  "starting",
  "idle",
  "busy",
  "draining",
  "updating",
  "degraded",
] as const;

/** Состояние агента (`status`, §6.2). */
export interface IAlpStatus {
  state: (typeof AGENT_STATES)[number];
  message?: string;
  /** Свободные места по очередям. */
  slots: Record<string, number>;
  /** Ёмкость очередей: нагрузки регистрируются и меняются после `hello`. */
  capacity?: Record<string, number>;
  jobs: { jobId: string; attempt: number; queue: string; startedAt?: number }[];
  workloads: {
    name: string;
    state: string;
    instances: number;
    version?: string;
  }[];
  /** Неподтверждённых надёжных сообщений у агента. */
  outbox: number;
}

export const AlpStatusSchema: z.ZodType<IAlpStatus> = z.object({
  state: z.enum(AGENT_STATES),
  message: z.string().max(500).optional(),
  slots: z.record(z.string().max(100), z.number().int().min(0)).default({}),
  capacity: z.record(z.string().max(100), z.number().int().min(0)).optional(),
  jobs: z
    .array(
      z.object({
        jobId: uuid,
        attempt,
        queue: z.string().max(100),
        startedAt: z.number().int().optional(),
      }),
    )
    .max(1000)
    .default([]),
  workloads: z
    .array(
      z.object({
        name: z.string().max(100),
        state: z.string().max(50),
        instances: z.number().int().min(0),
        version: z.string().max(50).optional(),
      }),
    )
    .max(100)
    .default([]),
  outbox: z.number().int().min(0).default(0),
});

const bytes = z.number().min(0);

/** Метрики хоста. */
export interface IAlpHostMetrics {
  cpuPercent?: number;
  load1?: number;
  memUsedBytes?: number;
  memTotalBytes?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  netRxBps?: number;
  netTxBps?: number;
  uptimeSec?: number;
}

/** Метрики GPU. */
export interface IAlpGpuMetrics {
  index: number;
  name: string;
  utilPercent?: number;
  memUsedBytes?: number;
  memTotalBytes?: number;
  temperatureC?: number;
}

/** Телеметрия агента (`metrics`, §6.2). */
export interface IAlpMetrics {
  collectedAt: number;
  host?: IAlpHostMetrics;
  gpus?: IAlpGpuMetrics[];
  /** Прикладные каналы: имя → данные (схема — у потребителя канала). */
  channels?: Record<string, unknown>;
}

export const AlpMetricsSchema: z.ZodType<IAlpMetrics> = z.object({
  collectedAt: z.number().int(),
  host: z
    .object({
      cpuPercent: z.number().min(0).optional(),
      load1: z.number().min(0).optional(),
      memUsedBytes: bytes.optional(),
      memTotalBytes: bytes.optional(),
      diskUsedBytes: bytes.optional(),
      diskTotalBytes: bytes.optional(),
      netRxBps: bytes.optional(),
      netTxBps: bytes.optional(),
      uptimeSec: bytes.optional(),
    })
    .optional(),
  gpus: z
    .array(
      z.object({
        index: z.number().int().min(0),
        name: z.string().max(200),
        utilPercent: z.number().min(0).optional(),
        memUsedBytes: bytes.optional(),
        memTotalBytes: bytes.optional(),
        temperatureC: z.number().optional(),
      }),
    )
    .max(64)
    .optional(),
  channels: z.record(z.string().max(50), z.unknown()).optional(),
});

// ─── Задачи ────────────────────────────────────────────────────────────

const jobRef = { jobId: uuid, attempt };

export const AlpJobRefSchema = z.object(jobRef);

export const AlpJobProgressSchema = z.object({
  ...jobRef,
  progress: z.number().min(0).max(1).optional(),
  text: z.string().max(200).optional(),
  log: z.array(z.string().max(1000)).max(100).optional(),
});

export const AlpJobEventSchema = z.object({
  ...jobRef,
  seq: z.number().int().min(1),
  type: z.string().min(1).max(50),
  data: z.unknown().optional(),
});

export const AlpJobUrlsRequestSchema = z.object({
  ...jobRef,
  inputs: z.array(z.string().max(100)).max(100).optional(),
  outputs: z.array(z.string().max(100)).max(100).optional(),
});

export const AlpJobCompleteSchema = z.object({
  ...jobRef,
  result: z.unknown().optional(),
});

export const AlpJobFailSchema = z.object({
  ...jobRef,
  code: errorCode,
  message: z.string().min(1).max(2000),
  retryable: z.boolean().default(true),
});

export const AlpJobRejectSchema = z.object({
  ...jobRef,
  code: errorCode,
  message: z.string().max(2000),
});

// ─── Команды ───────────────────────────────────────────────────────────

export const AlpCommandRefSchema = z.object({ commandId: uuid });

export const AlpCommandOutputSchema = z.object({
  commandId: uuid,
  chunk: z.string().max(64 * 1024),
});

export const AlpCommandDoneSchema = z.object({
  commandId: uuid,
  ok: z.boolean(),
  exitCode: z.number().int().optional(),
  result: z.unknown().optional(),
  error: z
    .object({ code: z.string().max(64), message: z.string().max(2000) })
    .optional(),
});

// ─── Желаемое состояние ────────────────────────────────────────────────

export const AlpStateAppliedSchema = z.object({
  domain: z.string().min(1).max(50),
  version: z.number().int().min(0),
  ok: z.boolean(),
  error: z.string().max(2000).optional(),
  report: z.unknown().optional(),
});

export type TAlpStateApplied = z.infer<typeof AlpStateAppliedSchema>;

// ─── Исходящие (сервер → агент) ────────────────────────────────────────

/** Настройки сессии, которые задаёт сервер. */
export interface IAlpSessionConfig {
  statusIntervalMs: number;
  metricsIntervalMs: number;
}

export interface IAlpWelcome {
  protocol: number;
  agentId: string;
  sessionId: string;
  serverTime: number;
  config: IAlpSessionConfig;
}

export interface IAlpAck {
  ids?: string[];
  seq?: number;
}

export interface IAlpError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface IAlpJobAssign {
  jobId: string;
  attempt: number;
  queue: string;
  data: unknown;
  leaseSeconds: number;
  inputs: Record<string, string>;
  outputs: Record<string, { url: string; contentType?: string }>;
  urlsExpireAt?: number;
}

export interface IAlpJobUrls {
  inputs: Record<string, string>;
  outputs: Record<string, { url: string; contentType?: string }>;
  expiresAt: number;
}

export interface IAlpCommandRun {
  commandId: string;
  name: string;
  args?: unknown;
  timeoutSec: number;
}

export interface IAlpStatePut {
  domain: string;
  version: number;
  spec: unknown;
}

/** Исходящие сообщения: тип → `data`. */
export interface IAlpOutgoing {
  welcome: IAlpWelcome;
  config: Partial<IAlpSessionConfig>;
  ack: IAlpAck;
  error: IAlpError;
  "job.assign": IAlpJobAssign;
  "job.urls": IAlpJobUrls;
  "job.cancel": { jobId: string; attempt: number };
  "job.stop": { jobId: string; attempt: number };
  "cmd.run": IAlpCommandRun;
  "state.put": IAlpStatePut;
}

export type TAlpOutgoingType = keyof IAlpOutgoing;

/** Класс доставки входящего сообщения (§4). */
export type TAlpDelivery = "stream" | "reliable" | "request";

/** Входящее сообщение: схема `data` и класс доставки. */
export interface IAlpIncomingSpec {
  schema: z.ZodType;
  delivery: TAlpDelivery;
}

/** Входящие сообщения базового протокола (без `hello`). */
export const ALP_INCOMING: Readonly<Record<string, IAlpIncomingSpec>> = {
  status: { schema: AlpStatusSchema, delivery: "stream" },
  metrics: { schema: AlpMetricsSchema, delivery: "stream" },
  "job.accept": { schema: AlpJobRefSchema, delivery: "stream" },
  "job.progress": { schema: AlpJobProgressSchema, delivery: "stream" },
  "job.reject": { schema: AlpJobRejectSchema, delivery: "reliable" },
  "job.event": { schema: AlpJobEventSchema, delivery: "reliable" },
  "job.urls": { schema: AlpJobUrlsRequestSchema, delivery: "request" },
  "job.complete": { schema: AlpJobCompleteSchema, delivery: "reliable" },
  "job.fail": { schema: AlpJobFailSchema, delivery: "reliable" },
  "cmd.accept": { schema: AlpCommandRefSchema, delivery: "stream" },
  "cmd.output": { schema: AlpCommandOutputSchema, delivery: "stream" },
  "cmd.done": { schema: AlpCommandDoneSchema, delivery: "reliable" },
  "state.applied": { schema: AlpStateAppliedSchema, delivery: "reliable" },
};
