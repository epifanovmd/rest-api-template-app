import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition } from "../../core";
import { ExternalJobService } from "./external-job.service";
import { JOB_EXTERNAL_SYNC_QUEUE } from "./jobs.types";

/**
 * Раз в минуту проваливает внешние задачи с истёкшим сроком
 * (`expireInSeconds` очереди) и отменяет их работу у воркеров.
 */
@Injectable()
export class ExternalSyncJobHandler implements IJobHandler<object, number> {
  readonly definition: JobDefinition = {
    queue: JOB_EXTERNAL_SYNC_QUEUE,
    cron: "* * * * *",
    retryLimit: 0,
    expireInSeconds: 120,
  };

  constructor(
    @inject(ExternalJobService) private readonly _external: ExternalJobService,
  ) {}

  handle(): Promise<number> {
    return this._external.failExpired();
  }
}
