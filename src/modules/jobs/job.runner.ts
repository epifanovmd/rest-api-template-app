import { inject, optional } from "inversify";
import type { JobResult, JobWithMetadata } from "pg-boss";

import {
  IJobHandler,
  IJobMetrics,
  Injectable,
  JOB_METRICS,
  JobContext,
  JobError,
  logger,
  requestContext,
} from "../../core";

interface IJobFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Ошибка обработчика → код, сообщение и можно ли повторять. */
export const toJobFailure = (err: unknown): IJobFailure => {
  if (err instanceof JobError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }

  const message = err instanceof Error ? err.message : String(err);

  return { code: "JOB_FAILED", message, retryable: true };
};

/** pg-boss хранит результат объектом. */
export const toJobOutput = (value: unknown): object | undefined => {
  if (value === undefined || value === null) return undefined;

  return typeof value === "object" ? value : { value };
};

/**
 * Выполнение задачи обработчиком: контекст, корреляция логов
 * `job:<queue>:<id>`, решение о повторе и метрики.
 */
@Injectable()
export class JobRunner {
  constructor(
    @inject(JOB_METRICS) @optional() private readonly _metrics?: IJobMetrics,
  ) {}

  /**
   * Выполнить задачу; результат — исход для pg-boss (`perJobResults`):
   * `deadletter` завершает задачу без повторов.
   */
  run(
    handler: IJobHandler<unknown, unknown>,
    job: JobWithMetadata<unknown>,
  ): Promise<JobResult> {
    const { queue } = handler.definition;

    return requestContext.run({ requestId: `job:${queue}:${job.id}` }, () =>
      this.execute(handler, job),
    );
  }

  private async execute(
    handler: IJobHandler<unknown, unknown>,
    job: JobWithMetadata<unknown>,
  ): Promise<JobResult> {
    const { queue } = handler.definition;
    const startedAt = Date.now();
    const attempt = job.retryCount;
    let ok = false;

    this.metric(m => m.onStart(queue));

    try {
      const ctx: JobContext<unknown> = {
        id: job.id,
        queue,
        data: job.data,
        attempt,
        // pg-boss прерывает задачу при остановке процесса и по таймауту.
        signal: job.signal,
      };

      logger.debug({ queue, jobId: job.id, attempt }, "[Jobs] Задача начата");

      const result = await handler.handle(ctx);

      ok = true;

      return { id: job.id, status: "completed", output: toJobOutput(result) };
    } catch (err) {
      return this.fail(job, queue, err);
    } finally {
      this.metric(m => m.onComplete(queue, Date.now() - startedAt, ok));
    }
  }

  private fail(
    job: JobWithMetadata<unknown>,
    queue: string,
    err: unknown,
  ): JobResult {
    const { code, message, retryable } = toJobFailure(err);
    const final = !retryable || job.retryCount >= job.retryLimit;

    logger.error(
      {
        err,
        queue,
        jobId: job.id,
        attempt: job.retryCount,
        errorCode: code,
        final,
      },
      "[Jobs] Задача завершилась ошибкой",
    );

    return {
      id: job.id,
      status: retryable ? "failed" : "deadletter",
      output: { code, message },
    };
  }

  private metric(fn: (metrics: IJobMetrics) => void): void {
    if (!this._metrics) return;

    try {
      fn(this._metrics);
    } catch (err) {
      logger.warn({ err }, "[Jobs] Метрики задач: ошибка хука");
    }
  }
}
