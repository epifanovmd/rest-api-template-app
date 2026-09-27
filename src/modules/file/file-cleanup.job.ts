import { inject } from "inversify";

import {
  FileStorage,
  IJobHandler,
  Injectable,
  JobDefinition,
  logger,
} from "../../core";
import { FileRepository } from "./file.repository";
import { FileQueues, PENDING_UPLOAD_TTL_MS } from "./file.types";
import { filePrefix } from "./file-keys";

/** Записей за один запуск. */
const BATCH = 500;

/**
 * `file.cleanup-pending` (раз в час): прямые загрузки, не подтверждённые
 * за сутки, удаляются вместе с объектами хранилища.
 */
@Injectable()
export class FileCleanupJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: FileQueues.cleanupPending,
    cron: "0 * * * *",
    retryLimit: 0,
  };

  constructor(
    @inject(FileRepository) private readonly _files: FileRepository,
    @inject(FileStorage) private readonly _storage: FileStorage,
  ) {}

  async handle(): Promise<{ removed: number }> {
    const stale = await this._files.findStalePending(
      new Date(Date.now() - PENDING_UPLOAD_TTL_MS),
      BATCH,
    );

    for (const file of stale) {
      await this._storage.deletePrefix(filePrefix(file.id));
      await this._files.delete(file.id);
    }

    if (stale.length > 0) {
      logger.info({ removed: stale.length }, "Stale pending uploads removed");
    }

    return { removed: stale.length };
  }
}
