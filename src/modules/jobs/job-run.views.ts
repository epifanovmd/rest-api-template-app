import { inject, optional } from "inversify";
import { posix } from "path";

import { config } from "../../config";
import { FileStorage, Injectable, logger } from "../../core";
import { IJobRunOutputDto, JobRunDto } from "./dto/job-run.dto";
import { JobRun } from "./job-run.entity";
import { IJobRunOutput } from "./jobs.types";

/** Ссылки на файлы итога одной задачи. */
const signOutputs = async (
  storage: FileStorage,
  outputs: IJobRunOutput[],
): Promise<IJobRunOutputDto[]> => {
  const ttlSeconds = config.storage.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  return Promise.all(
    outputs.map(async output => ({
      name: output.name,
      url: await storage.signedGetUrl(output.key, {
        ttlSeconds,
        downloadName: posix.basename(output.key),
      }),
      ...(output.size !== null && { size: output.size }),
      expiresAt,
    })),
  );
};

/**
 * DTO задач со ссылками на файлы итога: ссылки (`GET`, срок —
 * `STORAGE_SIGNED_URL_TTL_SECONDS`) подписываются пачкой до сборки DTO.
 * Хранилища нет или подпись не удалась — задача без ссылок.
 */
@Injectable()
export class JobRunViews {
  constructor(
    @inject(FileStorage) @optional() private readonly _storage?: FileStorage,
  ) {}

  async toDto(run: JobRun): Promise<JobRunDto> {
    const [dto] = await this.toDtos([run]);

    return dto;
  }

  toDtos(runs: readonly JobRun[]): Promise<JobRunDto[]> {
    return Promise.all(
      runs.map(async run =>
        JobRunDto.fromEntity(run, await this.outputsOf(run)),
      ),
    );
  }

  private async outputsOf(run: JobRun): Promise<IJobRunOutputDto[] | null> {
    const storage = this._storage;

    if (!storage || !run.outputs?.length) return null;

    try {
      return await signOutputs(storage, run.outputs);
    } catch (err) {
      logger.warn({ err, jobId: run.id }, "[Jobs] Ссылки на файлы итога");

      return null;
    }
  }
}
