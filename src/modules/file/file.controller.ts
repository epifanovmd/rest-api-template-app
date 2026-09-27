import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  File,
  Get,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
  UploadedFile,
} from "tsoa";

import type { IErrorResponseDto, IPaginatedDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { ICreateUploadBody, IDirectUploadDto, IFileDto } from "./file.dto";
import { FileService } from "./file.service";
import { CreateUploadSchema } from "./validation/create-upload.validate";

@Injectable()
@Tags("Files")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/file")
export class FileController extends Controller {
  constructor(@inject(FileService) private _fileService: FileService) {
    super();
  }

  /**
   * Файлы текущего пользователя, новые первыми. Ссылки в ответе подписаны
   * и действуют ограниченное время.
   *
   * @summary Мои файлы
   * @param offset Смещение
   * @param limit Размер страницы (до 100)
   */
  @Security("jwt")
  @Get()
  getMyFiles(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<IFileDto>> {
    const user = getContextUser(req);

    return this._fileService.getMyFiles(user.userId, offset, limit);
  }

  /**
   * Метаданные файла и подписанные ссылки на него.
   *
   * @summary Получение файла по ID
   * @param id ID файла
   */
  @Security("jwt")
  @Get("{id}")
  getFileById(@Path() id: UUID): Promise<IFileDto> {
    return this._fileService.getFileById(id);
  }

  /**
   * Загрузить небольшой файл (multipart, до 100 MB). Допустимы только типы
   * из белого списка; расширение, заявленный mime и сигнатура содержимого
   * должны совпадать, иначе 415. Медиа обрабатывается в фоне: файл
   * возвращается в статусе `processing`, по готовности приходит
   * `file:processed`.
   *
   * @summary Загрузка файла
   * @param file Файл, который нужно загрузить
   */
  @Security("jwt")
  @SuccessResponse(201, "Created")
  @Post()
  uploadFile(
    @Request() req: KoaRequest,
    @UploadedFile() file: File,
  ): Promise<IFileDto[]> {
    const user = getContextUser(req);

    return this._fileService.uploadFile([file], user.userId);
  }

  /**
   * Начать прямую загрузку крупного файла: возвращает подписанную ссылку
   * для `PUT` (с заголовками из `headers`, тело — ровно `size` байт).
   * После загрузки — `POST /uploads/{fileId}/complete`. Неподтверждённая
   * загрузка удаляется через сутки.
   *
   * @summary Прямая загрузка: получить ссылку
   */
  @Security("jwt")
  @SuccessResponse(201, "Created")
  @Post("uploads")
  @ValidateBody(CreateUploadSchema)
  createUpload(
    @Request() req: KoaRequest,
    @Body() body: ICreateUploadBody,
  ): Promise<IDirectUploadDto> {
    const user = getContextUser(req);

    return this._fileService.createUpload(user.userId, body);
  }

  /**
   * Завершить прямую загрузку: проверяются размер и сигнатура, затем
   * медиа ставится в фоновую обработку. Повторный вызов безопасен.
   *
   * @summary Прямая загрузка: завершить
   * @param fileId ID файла из ответа на создание загрузки
   */
  @Security("jwt")
  @Post("uploads/{fileId}/complete")
  completeUpload(
    @Request() req: KoaRequest,
    @Path() fileId: UUID,
  ): Promise<IFileDto> {
    const user = getContextUser(req);

    return this._fileService.completeUpload(fileId, user.userId);
  }

  /**
   * Удалить файл вместе с производными версиями. Доступно владельцу и
   * суперпользователю; файл, прикреплённый к сообщению, удалить нельзя (409).
   *
   * @summary Удаление файла
   * @param id ID файла
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteFile(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._fileService.deleteFile(id, user);
  }
}
