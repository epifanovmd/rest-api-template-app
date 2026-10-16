import { inject } from "inversify";
import type { SendOptions } from "pg-boss";

import { EnqueueOptions, Injectable, JobQueue } from "../../core";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobsError } from "./jobs.errors";
import { managerDb, PgBossService } from "./pg-boss.service";

/**
 * `JobQueue` на pg-boss. С `manager` задача создаётся в переданной
 * транзакции (outbox): откат отменяет и её.
 */
@Injectable()
export class PgBossJobQueue extends JobQueue {
  constructor(
    @inject(PgBossService) private readonly _boss: PgBossService,
    @inject(JobHandlerRegistry) private readonly _registry: JobHandlerRegistry,
  ) {
    super();
  }

  async enqueue<T extends object>(
    queue: string,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<string | null> {
    // Реестр заполняется до старта pg-boss: после ready() он полон.
    const boss = await this._boss.ready();

    if (!this._registry.get(queue)) throw JobsError.UNKNOWN_QUEUE({ queue });

    const sendOptions: SendOptions = {
      ...(options.startAfter !== undefined && {
        startAfter: options.startAfter,
      }),
      ...(options.singletonKey !== undefined && {
        singletonKey: options.singletonKey,
      }),
      ...(options.priority !== undefined && { priority: options.priority }),
      ...(options.manager && { db: managerDb(options.manager) }),
    };

    return boss.send(queue, data, sendOptions);
  }
}
