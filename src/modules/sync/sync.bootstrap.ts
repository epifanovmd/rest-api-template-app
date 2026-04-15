import { inject } from "inversify";

import { IBootstrap, Injectable, logger } from "../../core";
import { SyncService } from "./sync.service";

/** Retention cleanup: каждые 24 часа, удаляет записи старше 90 дней. */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

/**
 * Фоновая компактификация: safety net для write-time compaction.
 * С write-time compaction большинство дубликатов удаляются при записи.
 * Background job подчищает edge cases (concurrent writes, crashed write-time deletes).
 * Раз в 6 часов достаточно.
 */
const COMPACTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class SyncCleanupBootstrap implements IBootstrap {
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private _compactionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@inject(SyncService) private _syncService: SyncService) {}

  async initialize(): Promise<void> {
    // Запустить при старте
    await Promise.all([
      this._runCleanup(),
      this._runCompaction(),
    ]);

    this._cleanupTimer = setInterval(() => {
      this._runCleanup().catch(err => {
        logger.warn({ err }, "[Sync] Cleanup timer failed");
      });
    }, CLEANUP_INTERVAL_MS);

    this._compactionTimer = setInterval(() => {
      this._runCompaction().catch(err => {
        logger.warn({ err }, "[Sync] Compaction timer failed");
      });
    }, COMPACTION_INTERVAL_MS);
  }

  async destroy(): Promise<void> {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    if (this._compactionTimer) {
      clearInterval(this._compactionTimer);
      this._compactionTimer = null;
    }
  }

  private async _runCleanup(): Promise<void> {
    const deleted = await this._syncService.cleanup(RETENTION_DAYS);

    if (deleted > 0) {
      logger.info(
        { deleted, retentionDays: RETENTION_DAYS },
        "[Sync] Retention cleanup completed",
      );
    }
  }

  private async _runCompaction(): Promise<void> {
    await this._syncService.compact();
  }
}
