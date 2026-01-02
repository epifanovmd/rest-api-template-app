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

import { Injectable } from "../../core";
import { IFileDto } from "./file.model";
import { FileService } from "./file.service";

@Injectable()
@Tags("Files")
@Route("api/file")
export class FileController extends Controller {
  constructor(@inject(FileService) private _fileService: FileService) {
    super();
  }

  /**
   * Получить файл по ID.
   * Этот эндпоинт позволяет пользователю получить файл по его уникальному ID.
   * Он защищен с использованием JWT-аутентификации, что означает, что только аутентифицированные пользователи могут получить доступ к этому ресурсу.
   *
   * @summary Получение файла по ID
   * @param id ID файла, который нужно получить
   * @returns Информацию о файле, включая метаданные и его содержимое
   */
  @Security("jwt")
  @Get()
  getFileById(@Query("id") id: string): Promise<IFileDto> {
    return this._fileService.getFileById(id);
  }

  /**
   * Загрузить файл.
   * Этот эндпоинт позволяет пользователю загрузить один файл на сервер.
   * Он защищен с использованием JWT-аутентификации, что означает, что только аутентифицированные пользователи могут загружать файлы.
   *
   * @summary Загрузка файла
   * @param file Файл, который нужно загрузить
   * @returns Массив объектов, представляющих загруженные файлы с их метаданными
   */
  @Security("jwt")
  @Post()
  uploadFile(@UploadedFile() file: File): Promise<IFileDto[]> {
    return this._fileService.uploadFile([file]);
  }

  /**
   * Удалить файл.
   * Этот эндпоинт позволяет пользователю удалить файл по его ID. Доступ разрешен только пользователю, который загрузил файл, либо администратору.
   *
   * @summary Удаление файла
   * @param id ID файла, который нужно удалить
   * @returns Количество удаленных файлов (обычно 1, если файл существует)
   */
  @Security("jwt")
  @Delete("/{id}")
  deleteFile(id: string): Promise<number> {
    return this._fileService.deleteFile(id);
  }
}
