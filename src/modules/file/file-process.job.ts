import fs from "fs/promises";
import { inject } from "inversify";
import os from "os";
import path from "path";

import {
  EventBus,
  FileStorage,
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  JobError,
  logger,
} from "../../core";
import { FileProcessedEvent } from "./events";
import { File } from "./file.entity";
import { FileRepository } from "./file.repository";
import { EFileStatus, FileQueues, IFileProcessJobData } from "./file.types";
import { filePrefix, variantKey } from "./file-keys";
import { MediaProcessorService } from "./media-processor.service";

const RETRY_LIMIT = 2;

type TProcessedFields = Pick<
  File,
  | "optimizedKey"
  | "thumbnailKey"
  | "mediumKey"
  | "width"
  | "height"
  | "blurhash"
  | "duration"
  | "waveform"
>;

const withTmpDir = async <R>(fn: (dir: string) => Promise<R>): Promise<R> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "file-process-"));

  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

/**
 * `file.process`: webp, превью, blurhash, длительность и waveform из
 * оригинала в хранилище. Производные кладутся рядом с оригиналом, файл
 * переходит в `ready`; после последней попытки — в `failed` (оригинал
 * остаётся доступен). Итог — `FileProcessedEvent`.
 */
@Injectable()
export class FileProcessJob implements IJobHandler<IFileProcessJobData> {
  readonly definition: JobDefinition = {
    queue: FileQueues.process,
    retryLimit: RETRY_LIMIT,
  };

  constructor(
    @inject(FileRepository) private readonly _files: FileRepository,
    @inject(FileStorage) private readonly _storage: FileStorage,
    @inject(MediaProcessorService)
    private readonly _media: MediaProcessorService,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  async handle(ctx: JobContext<IFileProcessJobData>): Promise<void> {
    const file = await this._files.findById(ctx.data.fileId);

    if (!file || file.status !== EFileStatus.Processing) return;

    let fields: TProcessedFields;

    try {
      fields = await this._process(file, ctx.signal);
    } catch (err) {
      if (ctx.signal.aborted || ctx.attempt < RETRY_LIMIT) throw err;

      await this._finish(file, EFileStatus.Failed, {});
      throw new JobError(
        "FILE_PROCESSING_FAILED",
        (err as Error).message,
        false,
      );
    }

    await this._finish(file, EFileStatus.Ready, fields);
  }

  private _process(file: File, signal: AbortSignal): Promise<TProcessedFields> {
    return this._storage.withLocalFile(file.key, input =>
      withTmpDir(async dir => {
        const result = await this._media.process(input, file.type, dir, signal);
        const keys: Pick<
          TProcessedFields,
          "optimizedKey" | "thumbnailKey" | "mediumKey"
        > = { optimizedKey: null, thumbnailKey: null, mediumKey: null };

        for (const derivative of result.derivatives) {
          signal.throwIfAborted();

          const key = variantKey(file.id, derivative.variant, derivative.ext);

          await this._storage.put(
            key,
            { path: derivative.path },
            { contentType: derivative.contentType },
          );
          keys[`${derivative.variant}Key`] = key;
        }

        return {
          ...keys,
          width: result.width,
          height: result.height,
          blurhash: result.blurhash,
          duration: result.duration,
          waveform: result.waveform,
        };
      }),
    );
  }

  /** Статус из `processing`; файл удалён за время обработки — убрать производные. */
  private async _finish(
    file: File,
    status: EFileStatus,
    fields: Partial<TProcessedFields>,
  ): Promise<void> {
    const changed = await this._files.transitionStatus(
      file.id,
      EFileStatus.Processing,
      { ...fields, status },
    );

    if (!changed) {
      if (!(await this._files.findById(file.id))) {
        await this._storage.deletePrefix(filePrefix(file.id)).catch(err => {
          logger.error({ err, fileId: file.id }, "Failed to clean up file");
        });
      }

      return;
    }

    this._eventBus.emit(new FileProcessedEvent(file.id, file.ownerId, status));
  }
}
