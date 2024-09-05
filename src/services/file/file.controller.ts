import { inject, injectable } from "inversify";
import {
  Controller,
  Delete,
  File,
  Get,
  Post,
  Query,
  Route,
  Security,
  Tags,
  UploadedFile,
} from "tsoa";

import { FileService } from "./file.service";
import { IFileDto } from "./file.types";

@injectable()
@Tags("Files")
@Route("api/file")
export class FileController extends Controller {
  constructor(@inject(FileService) private _fileService: FileService) {
    super();
  }

  @Security("jwt")
  @Get()
  getFileById(@Query("id") id: string): Promise<IFileDto> {
    return this._fileService.getFileById(id);
  }

  @Security("jwt")
  @Post()
  uploadFile(@UploadedFile() file: File): Promise<IFileDto[]> {
    return this._fileService.uploadFile([file]);
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteFile(id: string): Promise<number> {
    return this._fileService.deleteFile(id);
  }
}
