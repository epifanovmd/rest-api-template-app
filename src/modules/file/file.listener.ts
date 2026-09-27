import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import {
  FileDeletedEvent,
  FileProcessedEvent,
  FileUploadedEvent,
} from "./events";
import { FileService } from "./file.service";

/**
 * Изменения файлов — владельцу, чтобы списки на всех его устройствах
 * совпадали: загрузка (`file:uploaded`), итог обработки (`file:processed`),
 * удаление (`file:deleted`).
 */
@Injectable()
export class FileListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(FileService) private readonly _files: FileService,
  ) {}

  register(): void {
    this._eventBus.on(FileUploadedEvent, event =>
      this._sendFile(event.userId, event.fileId, "file:uploaded"),
    );
    this._eventBus.on(FileProcessedEvent, event =>
      this._sendFile(event.ownerId, event.fileId, "file:processed"),
    );
    this._eventBus.on(FileDeletedEvent, event => {
      if (event.ownerId) {
        this._emitter.toUser(event.ownerId, "file:deleted", {
          id: event.fileId,
        });
      }
    });
  }

  /** DTO файла владельцу; файл удалён к моменту отправки — событие не шлётся. */
  private async _sendFile(
    ownerId: string | null,
    fileId: string,
    event: "file:uploaded" | "file:processed",
  ) {
    if (!ownerId) return;

    try {
      const file = await this._files.getFileById(fileId);

      this._emitter.toUser(ownerId, event, file);
    } catch (err) {
      logger.warn({ err, fileId }, `${event} not sent`);
    }
  }
}
