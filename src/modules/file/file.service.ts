import { randomUUID } from "crypto";
import fs from "fs/promises";
import { inject } from "inversify";
import { buffer } from "stream/consumers";
import { File as UploadedFile } from "tsoa";
import { DataSource, EntityManager, In } from "typeorm";

import {
  EventBus,
  FileStorage,
  Injectable,
  IPaginatedDto,
  isSuperUser,
  JobQueue,
  logger,
  normalizePagination,
  toPage,
} from "../../core";
import { AuthContext } from "../../types/koa";
import type { ISignedPutUrlOptions } from "../storage";
import { FileDeletedEvent, FileUploadedEvent } from "./events";
import { ICreateUploadBody, IDirectUploadDto, IFileDto } from "./file.dto";
import { File } from "./file.entity";
import { FileError } from "./file.errors";
import { FileRepository } from "./file.repository";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  DIRECT_UPLOAD_URL_TTL_SECONDS,
  EFileStatus,
  FILE_REMOVE_CHUNK,
  FileQueues,
  IFileProcessJobData,
  IFileRemoveJobData,
} from "./file.types";
import { filePrefix, originalKey } from "./file-keys";
import {
  isAllowedUpload,
  SIGNATURE_PROBE_BYTES,
  verifyFileSignature,
  verifyFileSignatureHead,
} from "./file-upload.policy";
import { FileUrlService } from "./file-url.service";
import { FileUsageChecker } from "./file-usage.checker";
import { isProcessableMedia } from "./media-processor.service";

const unlinkQuiet = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error({ err, filePath }, "Failed to remove temporary upload");
    }
  }
};

/** Статус сразу после сохранения оригинала. */
const statusAfterUpload = (mimeType: string) =>
  isProcessableMedia(mimeType) ? EFileStatus.Processing : EFileStatus.Ready;

@Injectable()
export class FileService {
  constructor(
    @inject(FileRepository) private _fileRepository: FileRepository,
    @inject(FileUrlService) private _urls: FileUrlService,
    @inject(FileStorage) private _storage: FileStorage,
    @inject(JobQueue) private _jobs: JobQueue,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
    @inject(FileUsageChecker) private _usage: FileUsageChecker,
  ) {}

  async getFileById(id: string): Promise<IFileDto> {
    return this._urls.toDto(await this._getFile(id));
  }

  /** Файлы пользователя постранично, новые первыми. */
  async getMyFiles(
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<IFileDto>> {
    const page = normalizePagination(offset, limit);
    const [files, total] = await this._fileRepository.findPageByOwner(
      userId,
      page,
    );

    return toPage(await this._urls.toDtos(files), total, page);
  }

  /**
   * Multipart-загрузка: сигнатура проверяется на временном файле multer,
   * оригинал уходит в хранилище, запись и задача обработки медиа создаются
   * в одной транзакции. Временные файлы удаляются в любом случае.
   */
  async uploadFile(files: UploadedFile[], userId: string): Promise<IFileDto[]> {
    const ids = files.map(() => randomUUID());

    try {
      await this._assertValidUploads(files);

      const entities = await this._storeUploads(files, ids, userId).catch(
        async (err: unknown) => {
          await this._removeStored(ids);
          throw err;
        },
      );

      entities.forEach(file => this._emitUploaded(file));

      return this._urls.toDtos(entities);
    } finally {
      await Promise.all(files.map(file => unlinkQuiet(file.path)));
    }
  }

  /**
   * Прямая загрузка крупного файла: запись `pending` и подписанный `PUT`
   * с точным размером и типом. Файл станет доступен после `completeUpload`.
   */
  async createUpload(
    userId: string,
    body: ICreateUploadBody,
  ): Promise<IDirectUploadDto> {
    if (!isAllowedUpload(body.name, body.contentType)) {
      throw FileError.TYPE_NOT_ALLOWED();
    }

    if (body.size > DIRECT_UPLOAD_MAX_BYTES) throw FileError.TOO_LARGE();

    const id = randomUUID();
    const key = originalKey(id, body.name);

    await this._fileRepository.createAndSave({
      id,
      ownerId: userId,
      name: body.name,
      type: body.contentType,
      size: body.size,
      status: EFileStatus.Pending,
      key,
    });

    const putOptions: ISignedPutUrlOptions = {
      contentType: body.contentType,
      contentLength: body.size,
      ttlSeconds: DIRECT_UPLOAD_URL_TTL_SECONDS,
    };

    return {
      fileId: id,
      uploadUrl: await this._storage.signedPutUrl(key, putOptions),
      headers: { "Content-Type": body.contentType },
      expiresAt: new Date(Date.now() + DIRECT_UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  /**
   * Подтверждение прямой загрузки: объект есть, размер совпадает с
   * заявленным, сигнатура — с расширением; затем задача обработки.
   * Повторный вызов возвращает текущее состояние.
   */
  async completeUpload(fileId: string, userId: string): Promise<IFileDto> {
    const file = await this._getFile(fileId);

    if (file.ownerId !== userId) throw FileError.FORBIDDEN();
    if (file.status !== EFileStatus.Pending) return this._urls.toDto(file);

    const stored = await this._storage.stat(file.key);

    if (!stored) throw FileError.UPLOAD_INCOMPLETE();

    if (stored.size !== file.size) {
      await this._storage.delete(file.key);
      throw FileError.SIZE_MISMATCH();
    }

    const head = await buffer(
      await this._storage.get(file.key, {
        start: 0,
        end: Math.min(file.size, SIGNATURE_PROBE_BYTES) - 1,
      }),
    );

    if (!(await verifyFileSignatureHead(head, file.name))) {
      await this._fileRepository.delete(file.id);
      await this._removeStored([file.id]);
      throw FileError.SIGNATURE_MISMATCH();
    }

    const status = statusAfterUpload(file.type);
    const isCompleted = await this._dataSource.transaction(async manager => {
      const changed = await this._fileRepository.transitionStatus(
        file.id,
        EFileStatus.Pending,
        { status },
        manager,
      );

      if (changed && status === EFileStatus.Processing) {
        await this._enqueueProcessing(manager, file.id);
      }

      return changed;
    });

    if (isCompleted) this._emitUploaded(file);

    return this.getFileById(file.id);
  }

  /**
   * Удаляет владелец или суперпользователь. Используемый файл (вложение
   * сообщения) удалить нельзя — 409. Объекты хранилища удаляются после
   * записи; сбой только логируется.
   */
  async deleteFile(id: string, user: AuthContext): Promise<void> {
    const file = await this._getFile(id);

    if (file.ownerId !== user.userId && !isSuperUser(user)) {
      throw FileError.FORBIDDEN();
    }

    if ((await this._usage.inUse([id])).size) throw FileError.IN_USE();

    await this._fileRepository.delete(id);
    await this._removeStored([id]);
    this._eventBus.emit(new FileDeletedEvent(file.id, file.ownerId));
  }

  /**
   * Передать загруженные пользователем файлы предметной области (кадр,
   * модель): владелец снимается, дальше файл живёт, пока на него ссылается
   * запись модуля (проба использования), и удаляется сборщиком мусора, когда
   * ссылок не останется. Вызывать в транзакции, создающей ссылки.
   */
  async adopt(
    fileIds: string[],
    uploaderId: string,
    manager?: EntityManager,
  ): Promise<File[]> {
    const ids = [...new Set(fileIds)];
    const repo = manager ? manager.getRepository(File) : this._fileRepository;
    const files = await repo.find({ where: { id: In(ids) } });

    if (files.length !== ids.length) throw FileError.NOT_FOUND();

    for (const file of files) {
      if (file.ownerId !== uploaderId) throw FileError.FORBIDDEN();
      if (file.status === EFileStatus.Pending) {
        throw FileError.UPLOAD_INCOMPLETE();
      }
    }

    await repo.update({ id: In(ids) }, { ownerId: null });
    files.forEach(file => (file.ownerId = null));

    return files;
  }

  /**
   * Файл из локального пути (распаковка архива, результат обработки):
   * проверка сигнатуры, оригинал — в хранилище, запись и задача обработки.
   * Без `ownerId` файл сразу принадлежит предметной области.
   */
  async createFromLocal(
    source: { path: string; name: string; type: string },
    options: { ownerId?: string | null; manager?: EntityManager } = {},
  ): Promise<File> {
    if (
      !isAllowedUpload(source.name, source.type) ||
      !(await verifyFileSignature(source.path, source.name))
    ) {
      throw FileError.SIGNATURE_MISMATCH();
    }

    const id = randomUUID();
    const key = originalKey(id, source.name);
    const { size } = await fs.stat(source.path);

    await this._storage.put(
      key,
      { path: source.path },
      {
        contentType: source.type,
      },
    );

    const create = (manager: EntityManager) =>
      this._createFile(manager, {
        id,
        ownerId: options.ownerId ?? null,
        name: source.name,
        type: source.type,
        size,
        status: statusAfterUpload(source.type),
        key,
      });

    try {
      return options.manager
        ? await create(options.manager)
        : await this._dataSource.transaction(create);
    } catch (err) {
      await this._removeStored([id]);
      throw err;
    }
  }

  /**
   * Объект, уже загруженный по подписанной ссылке (выход внешнего воркера),
   * становится файлом. Ключ выдаёт `reserveFileKey`; размер — из хранилища.
   */
  async registerStored(
    stored: { fileId: string; key: string; name: string; type: string },
    options: { ownerId?: string | null; manager?: EntityManager } = {},
  ): Promise<File> {
    if (stored.key !== originalKey(stored.fileId, stored.name)) {
      throw FileError.NOT_FOUND();
    }

    const object = await this._storage.stat(stored.key);

    if (!object) throw FileError.UPLOAD_INCOMPLETE();

    const create = (manager: EntityManager) =>
      this._createFile(manager, {
        id: stored.fileId,
        ownerId: options.ownerId ?? null,
        name: stored.name,
        type: stored.type,
        size: object.size,
        status: statusAfterUpload(stored.type),
        key: stored.key,
      });

    return options.manager
      ? create(options.manager)
      : this._dataSource.transaction(create);
  }

  /**
   * Запланировать удаление файлов, на которые больше нет ссылок (кадры
   * удалены). Задача ставится в транзакции удаления (outbox); используемые
   * к моменту выполнения файлы задача пропускает.
   */
  async scheduleRemoval(
    fileIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const ids = [...new Set(fileIds)];

    for (let start = 0; start < ids.length; start += FILE_REMOVE_CHUNK) {
      await this._jobs.enqueue<IFileRemoveJobData>(
        FileQueues.remove,
        { fileIds: ids.slice(start, start + FILE_REMOVE_CHUNK) },
        { manager },
      );
    }
  }

  /** Удалить из `fileIds` те, на которые никто не ссылается; вернуть их число. */
  async removeUnused(fileIds: string[]): Promise<number> {
    const files = await this._fileRepository.find({
      select: { id: true },
      where: { id: In(fileIds) },
    });
    const inUse = await this._usage.inUse(files.map(f => f.id));
    const unused = files.map(f => f.id).filter(id => !inUse.has(id));

    if (!unused.length) return 0;

    await this._fileRepository.delete({ id: In(unused) });
    await this._removeStored(unused);

    return unused.length;
  }

  /** Оригиналы — в хранилище, записи и задачи обработки — одной транзакцией. */
  private async _storeUploads(
    files: UploadedFile[],
    ids: string[],
    userId: string,
  ): Promise<File[]> {
    await Promise.all(
      files.map((file, index) =>
        this._storage.put(
          originalKey(ids[index], file.originalname),
          { path: file.path },
          { contentType: file.mimetype },
        ),
      ),
    );

    return this._dataSource.transaction(manager =>
      Promise.all(
        files.map((file, index) =>
          this._createFile(manager, {
            id: ids[index],
            ownerId: userId,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            status: statusAfterUpload(file.mimetype),
            key: originalKey(ids[index], file.originalname),
          }),
        ),
      ),
    );
  }

  private async _getFile(id: string): Promise<File> {
    const file = await this._fileRepository.findById(id);

    if (!file) throw FileError.NOT_FOUND();

    return file;
  }

  private async _createFile(
    manager: EntityManager,
    data: Pick<
      File,
      "id" | "ownerId" | "name" | "type" | "size" | "status" | "key"
    >,
  ): Promise<File> {
    const file = await manager
      .getRepository(File)
      .save(manager.getRepository(File).create(data));

    if (file.status === EFileStatus.Processing) {
      await this._enqueueProcessing(manager, file.id);
    }

    return file;
  }

  private async _enqueueProcessing(manager: EntityManager, fileId: string) {
    await this._jobs.enqueue<IFileProcessJobData>(
      FileQueues.process,
      { fileId },
      { manager, singletonKey: fileId },
    );
  }

  private _emitUploaded(file: File) {
    if (!file.ownerId) return;

    this._eventBus.emit(
      new FileUploadedEvent(file.id, file.ownerId, file.type),
    );
  }

  /** Сигнатура каждого файла совпадает с расширением; иначе — 415. */
  private async _assertValidUploads(files: UploadedFile[]) {
    const checks = await Promise.all(
      files.map(
        async file =>
          isAllowedUpload(file.originalname, file.mimetype) &&
          (await verifyFileSignature(file.path, file.originalname)),
      ),
    );

    if (!checks.every(Boolean)) throw FileError.SIGNATURE_MISMATCH();
  }

  private async _removeStored(fileIds: string[]) {
    await Promise.all(
      fileIds.map(id =>
        this._storage.deletePrefix(filePrefix(id)).catch((err: unknown) => {
          logger.error({ err, fileId: id }, "Failed to remove stored file");
        }),
      ),
    );
  }
}
