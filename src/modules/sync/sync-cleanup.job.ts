import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition, logger } from "../../core";
import { SyncService } from "./sync.service";
import { SYNC_CLEANUP_QUEUE, SYNC_RETENTION_DAYS } from "./sync.types";

/** Retention журнала: раз в сутки удаляет записи старше срока хранения. */
@Injectable()
export class SyncCleanupJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: SYNC_CLEANUP_QUEUE,
    cron: "30 3 * * *",
    retryLimit: 2,
    expireInSeconds: 30 * 60,
  };

  constructor(@inject(SyncService) private readonly _sync: SyncService) {}

  async handle(): Promise<void> {
    const deleted = await this._sync.cleanup(SYNC_RETENTION_DAYS);

    if (deleted > 0) {
      logger.info(
        { deleted, retentionDays: SYNC_RETENTION_DAYS },
        "[Sync] Retention cleanup completed",
      );
    }
  }
}
