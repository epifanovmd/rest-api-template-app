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

const { getFileById, uploadFile, deleteFile } = new FileService();

// @injectable()
@Tags("Files")
@Route("api/file")
export class FileController extends Controller {
  @Security("jwt")
  @Get()
  getFileById(@Query("id") id: string): Promise<IFileDto> {
    return getFileById(id);
  }

  @Security("jwt")
  @Post()
  uploadFile(@UploadedFile() file: File): Promise<IFileDto[]> {
    return uploadFile([file]);
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteFile(id: string): Promise<number> {
    return deleteFile(id);
  }
}
