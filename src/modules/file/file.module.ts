import { asJobHandler, Module } from "../../core";
import { asSocketListener } from "../socket";
import { StorageModule } from "../storage";
import { FileController } from "./file.controller";
import { File } from "./file.entity";
import { FileListener } from "./file.listener";
import { FileRepository } from "./file.repository";
import { FileService } from "./file.service";
import { FileCleanupJob } from "./file-cleanup.job";
import { FileGcJob } from "./file-gc.job";
import { FileProcessJob } from "./file-process.job";
import { FileRemoveJob } from "./file-remove.job";
import { FileUrlService } from "./file-url.service";
import { FileUsageChecker } from "./file-usage.checker";
import { MediaProcessorService } from "./media-processor.service";

@Module({
  imports: [StorageModule],
  entities: [File],
  providers: [
    FileRepository,
    MediaProcessorService,
    FileUrlService,
    FileUsageChecker,
    FileService,
    FileController,
    asJobHandler(FileProcessJob),
    asJobHandler(FileCleanupJob),
    asJobHandler(FileRemoveJob),
    asJobHandler(FileGcJob),
    asSocketListener(FileListener),
  ],
})
export class FileModule {}
