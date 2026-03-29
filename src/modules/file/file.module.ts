import { Module } from "../../core";
import { FileController } from "./file.controller";
import { FileRepository } from "./file.repository";
import { FileService } from "./file.service";
import { MediaProcessorService } from "./media-processor.service";

@Module({
  providers: [FileRepository, MediaProcessorService, FileController, FileService],
})
export class FileModule {}
