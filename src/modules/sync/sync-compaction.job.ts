import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition, logger } from "../../core";
import { SyncService } from "./sync.service";
import { SYNC_COMPACTION_QUEUE } from "./sync.types";

/**
 * Фоновая компактификация — страховка для write-time compaction
 * (конкурентные записи, упавший DELETE). Раз в 6 часов достаточно.
 */
@Injectable()
export class SyncCompactionJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: SYNC_COMPACTION_QUEUE,
    cron: "15 */6 * * *",
    retryLimit: 2,
    expireInSeconds: 30 * 60,
  };

  constructor(@inject(SyncService) private readonly _sync: SyncService) {}

  async handle(): Promise<void> {
    const deleted = await this._sync.compact();

    if (deleted > 0) {
      logger.info({ deleted }, "[Sync] Compaction completed");
    }
  }
}
