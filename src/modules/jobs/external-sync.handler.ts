import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition } from "../../core";
import { ExternalJobService } from "./external-job.service";
import { JOB_EXTERNAL_SYNC_QUEUE } from "./jobs.types";

/**
 * Раз в минуту проваливает внешние задачи с истёкшим сроком
 * (`expireInSeconds` очереди) и отменяет их работу у воркеров, а ждущие
 * передаёт: повторы pg-boss могли кончиться, пока задачу передавал другой
 * процесс, и без этого она осталась бы `queued` до подключения агента.
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

  async handle(): Promise<number> {
    const expired = await this._external.failExpired();

    await this._external.startQueued();

    return expired;
  }
}
