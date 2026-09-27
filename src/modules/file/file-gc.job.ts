import { inject } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  logger,
} from "../../core";
import { FileRepository } from "./file.repository";
import { FileService } from "./file.service";
import { FILE_GC_BATCH, FILE_GC_GRACE_MS, FileQueues } from "./file.types";

/**
 * `file.gc` (раз в сутки): бесхозные файлы — владелец снят (файл отдан
 * предметной области) или удалён — без ссылок по пробам использования
 * удаляются вместе с объектами хранилища. Так уходят файлы, чьи ссылающиеся
 * записи удалились каскадом (пространство, пользователь).
 */
@Injectable()
export class FileGcJob implements IJobHandler<object, number> {
  readonly definition: JobDefinition = {
    queue: FileQueues.gc,
    cron: "15 4 * * *",
    retryLimit: 1,
    expireInSeconds: 3_600,
  };

  constructor(
    @inject(FileRepository) private readonly _repo: FileRepository,
    @inject(FileService) private readonly _files: FileService,
  ) {}

  async handle(ctx: JobContext): Promise<number> {
    const before = new Date(Date.now() - FILE_GC_GRACE_MS);
    let afterId: string | null = null;
    let removed = 0;

    while (!ctx.signal.aborted) {
      const batch = await this._repo.findOrphans(
        before,
        afterId,
        FILE_GC_BATCH,
      );

      if (!batch.length) break;

      removed += await this._files.removeUnused(batch.map(f => f.id));
      afterId = batch[batch.length - 1].id;

      if (batch.length < FILE_GC_BATCH) break;
    }

    if (removed)
      logger.info({ removed }, "[File] Собраны неиспользуемые файлы");

    return removed;
  }
}
