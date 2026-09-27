import { inject } from "inversify";
import { DataSource, In, LessThan } from "typeorm";

import { Injectable } from "../../core";
import type { IWorkerInfoBody, IWorkerQueueStatusDto } from "./dto/worker.dto";
import { JobWorker } from "./job-worker.entity";
import { WORKER_ONLINE_SECONDS } from "./jobs.types";

/** Кто из внешних воркеров на связи: отметка при каждом `claim`. */
@Injectable()
export class JobWorkerTracker {
  constructor(@inject(DataSource) private readonly _dataSource: DataSource) {}

  /** Воркер взял (или ждёт) задачи этих очередей. */
  async seen(
    queues: string[],
    info: IWorkerInfoBody | undefined,
    keyId: string | null,
  ): Promise<void> {
    const name = info?.name ?? keyId ?? "unknown";
    const now = new Date();

    await this._dataSource
      .createQueryBuilder()
      .insert()
      .into(JobWorker)
      .values(
        queues.map(queue => ({
          name,
          queue,
          keyId,
          meta: info?.meta ?? {},
          lastSeenAt: now,
        })),
      )
      .orUpdate(["key_id", "meta", "last_seen_at"], ["name", "queue"])
      .execute();
  }

  /** Статус очередей: воркеры, видевшиеся за последние сутки, и кто на связи сейчас. */
  async status(queues: string[]): Promise<IWorkerQueueStatusDto[]> {
    const onlineSince = Date.now() - WORKER_ONLINE_SECONDS * 1000;
    const rows = queues.length
      ? await this._dataSource.getRepository(JobWorker).find({
          where: { queue: In(queues) },
          order: { lastSeenAt: "DESC" },
        })
      : [];

    return queues.map(queue => {
      const workers = rows
        .filter(row => row.queue === queue)
        .map(row => ({
          name: row.name,
          lastSeenAt: row.lastSeenAt,
          meta: row.meta,
        }));

      return {
        queue,
        online: workers.some(w => w.lastSeenAt.getTime() >= onlineSince),
        workers,
      };
    });
  }

  /** Забыть воркеров, не появлявшихся с `before`. */
  async forget(before: Date): Promise<number> {
    const { affected } = await this._dataSource
      .getRepository(JobWorker)
      .delete({ lastSeenAt: LessThan(before) });

    return affected ?? 0;
  }
}
