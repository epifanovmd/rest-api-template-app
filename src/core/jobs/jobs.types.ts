import type { EntityManager } from "typeorm";

import type { TokenProvider } from "../decorators";

/** Токен multi-inject обработчиков задач: модули регистрируют `asJobHandler(Cls)`. */
export const JOB_HANDLER = Symbol("JobHandler");

/** Описание очереди: политика повторов, срок, параллельность, расписание. */
export interface JobDefinition {
  /** Имя очереди, `домен.действие`: `mail.send`, `file.process`. */
  queue: string;
  /** Повторов после ошибки (по умолчанию 3). */
  retryLimit?: number;
  /** Задержка первого повтора, секунд (по умолчанию 10). */
  retryDelaySeconds?: number;
  /** Экспоненциальная задержка повторов (по умолчанию true). */
  retryBackoff?: boolean;
  /** Сколько задача может выполняться, секунд (по умолчанию 900). */
  expireInSeconds?: number;
  /** Параллельных задач очереди на процесс; по умолчанию `JOBS_CONCURRENCY`. */
  concurrency?: number;
  /** Cron: очередь запускается по расписанию ровно одним процессом кластера. */
  cron?: string;
}

/** Контекст выполнения задачи. */
export interface JobContext<T = unknown> {
  id: string;
  queue: string;
  data: T;
  /** Номер попытки, с 0. */
  attempt: number;
  /** Срабатывает при остановке процесса и по истечении срока задачи. */
  signal: AbortSignal;
}

export interface IJobHandler<T = unknown, R = unknown> {
  readonly definition: JobDefinition;
  handle(ctx: JobContext<T>): Promise<R | void>;
}

export interface EnqueueOptions {
  /** Отложить запуск: дата или секунды. */
  startAfter?: Date | number;
  /** Дедупликация: пока задача с этим ключом не завершена, новая не создаётся. */
  singletonKey?: string;
  priority?: number;
  /**
   * Транзакция TypeORM: задача создаётся атомарно с изменениями данных
   * (outbox) — откат транзакции отменяет и задачу.
   */
  manager?: EntityManager;
}

/**
 * Очередь задач. Реализация — модуль `jobs` (pg-boss на Postgres): задачи
 * переживают рестарт, выполняются с повторами на процессах `APP_ROLE=worker|all`.
 * Абстрактный класс служит DI-токеном: `@inject(JobQueue)`.
 */
export abstract class JobQueue {
  /** Поставить задачу; `null` — отброшена дедупликацией по `singletonKey`. */
  abstract enqueue<T extends object>(
    queue: string,
    data: T,
    options?: EnqueueOptions,
  ): Promise<string | null>;
}

/** Ошибка задачи с машинным кодом; `retryable: false` — без повторов. */
export class JobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "JobError";
  }
}

export const asJobHandler = (
  handler: new (...args: any[]) => IJobHandler<any, any>,
): TokenProvider<IJobHandler> => ({ provide: JOB_HANDLER, useClass: handler });

// ─── Метрики ───────────────────────────────────────────────────────────

/**
 * Необязательный токен метрик задач: реализация (prom-client) привязывается
 * модулем наблюдаемости, очередь вызывает её, если привязана.
 */
export const JOB_METRICS = Symbol("JobMetrics");

export interface IJobMetrics {
  onStart(queue: string): void;
  /** `ok = false` — задача упала или отменена. */
  onComplete(queue: string, durationMs: number, ok: boolean): void;
}
