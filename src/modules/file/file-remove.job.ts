import { inject } from "inversify";

import { IJobHandler, Injectable, JobContext, JobDefinition } from "../../core";
import { FileService } from "./file.service";
import { FileQueues, IFileRemoveJobData } from "./file.types";

/** `file.remove`: удаление файлов, на которые больше нет ссылок. */
@Injectable()
export class FileRemoveJob implements IJobHandler<IFileRemoveJobData, number> {
  readonly definition: JobDefinition = {
    queue: FileQueues.remove,
    retryLimit: 5,
    retryDelaySeconds: 30,
  };

  constructor(@inject(FileService) private readonly _files: FileService) {}

  handle(ctx: JobContext<IFileRemoveJobData>): Promise<number> {
    return this._files.removeUnused(ctx.data.fileIds);
  }
}
