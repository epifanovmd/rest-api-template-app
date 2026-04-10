import { inject } from "inversify";

import { IBootstrap, Injectable, logger } from "../../core";
import { SyncService } from "./sync.service";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_DAYS = 90;

@Injectable()
export class SyncCleanupBootstrap implements IBootstrap {
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(@inject(SyncService) private _syncService: SyncService) {}

  async initialize(): Promise<void> {
    await this._runCleanup();

    this._timer = setInterval(() => {
      this._runCleanup().catch(err => {
        logger.warn({ err }, "Sync log cleanup failed");
      });
    }, CLEANUP_INTERVAL_MS);
  }

  async destroy(): Promise<void> {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private async _runCleanup(): Promise<void> {
    const deleted = await this._syncService.cleanup(RETENTION_DAYS);

    if (deleted > 0) {
      logger.info({ deleted, retentionDays: RETENTION_DAYS }, "Sync log cleanup completed");
    }
  }
}
