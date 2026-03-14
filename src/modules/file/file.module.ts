import { Module } from "../../core";
import { FileController } from "./file.controller";
import { FileRepository } from "./file.repository";
import { FileService } from "./file.service";

@Module({
  providers: [FileRepository, FileController, FileService],
})
export class FileModule {}
