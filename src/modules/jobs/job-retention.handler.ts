import { inject } from "inversify";

import { config } from "../../config";
import { IJobHandler, Injectable, JobDefinition, logger } from "../../core";
import { JobRunRepository } from "./job-run.repository";
import { JobWorkerTracker } from "./job-worker.tracker";
import { JOB_RETENTION_QUEUE, WORKER_FORGET_DAYS } from "./jobs.types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Раз в сутки удаляет завершённые записи задач старше `JOBS_RETENTION_DAYS` и
 * воркеров, пропавших дольше недели.
 */
@Injectable()
export class JobRetentionJobHandler implements IJobHandler<object, number> {
  readonly definition: JobDefinition = {
    queue: JOB_RETENTION_QUEUE,
    cron: "30 3 * * *",
    retryLimit: 1,
    expireInSeconds: 600,
  };

  constructor(
    @inject(JobRunRepository) private readonly _runs: JobRunRepository,
    @inject(JobWorkerTracker) private readonly _workers: JobWorkerTracker,
  ) {}

  async handle(): Promise<number> {
    const before = new Date(Date.now() - config.jobs.retentionDays * DAY_MS);
    const removed = await this._runs.deleteSettledBefore(before);
    const forgotten = await this._workers.forget(
      new Date(Date.now() - WORKER_FORGET_DAYS * DAY_MS),
    );

    if (removed || forgotten) {
      logger.info(
        { removed, forgotten },
        "[Jobs] Удалены старые записи задач и воркеров",
      );
    }

    return removed;
  }
}
