import { Module } from "../../core/decorators/module.decorator";
import { FileController } from "./file.controller";
import { FileService } from "./file.service";

@Module({
  providers: [FileController, FileService],
})
export class FileModule {}
