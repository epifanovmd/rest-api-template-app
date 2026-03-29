import { NotFoundException } from "@force-dev/utils";
import fs from "fs/promises";
import { inject } from "inversify";
import path from "path";
import { File } from "tsoa";
import { v4 } from "uuid";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import { FileUploadedEvent } from "./events";
import { FileRepository } from "./file.repository";
import { MediaProcessorService } from "./media-processor.service";

@Injectable()
export class FileService {
  constructor(
    @inject(FileRepository) private _fileRepository: FileRepository,
    @inject(MediaProcessorService) private _mediaProcessor: MediaProcessorService,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async getFileById(id: string) {
    const file = await this._fileRepository.findById(id);

    if (!file) {
      throw new NotFoundException("Файл не найден");
    }

    return file.toDTO();
  }

  async uploadFile(files: File[], userId?: string) {
    const fileEntities = await Promise.all(
      files.map(async file => {
        const id = v4();

        let url = file.path;
        let size = file.size;
        let width: number | null = null;
        let height: number | null = null;
        let thumbnailUrl: string | null = null;
        let mediumUrl: string | null = null;
        let blurhash: string | null = null;
        let duration: number | null = null;

        if (file.mimetype.startsWith("image/")) {
          const result = await this._mediaProcessor.processImage(file.path, id);

          url = result.url;
          size = result.size;
          width = result.width;
          height = result.height;
          thumbnailUrl = result.thumbnailUrl;
          mediumUrl = result.mediumUrl;
          blurhash = result.blurhash;
        } else if (file.mimetype.startsWith("video/")) {
          const result = await this._mediaProcessor.processVideo(file.path, id);

          thumbnailUrl = result.thumbnailUrl;
          mediumUrl = result.mediumUrl;
          width = result.width;
          height = result.height;
          duration = result.duration;
        } else if (file.mimetype.startsWith("audio/")) {
          const result = await this._mediaProcessor.processAudio(file.path);

          duration = result.duration;
        }

        return this._fileRepository.createAndSave({
          id,
          name: file.originalname,
          type: file.mimetype,
          url,
          size,
          thumbnailUrl,
          mediumUrl,
          blurhash,
          width,
          height,
          duration,
        });
      }),
    );

    if (userId) {
      for (const entity of fileEntities) {
        this._eventBus.emit(
          new FileUploadedEvent(entity.id, userId, entity.type),
        );
      }
    }

    return fileEntities.map(file => file.toDTO());
  }

  async deleteFile(id: string): Promise<boolean> {
    const file = await this._fileRepository.findById(id);

    if (!file) {
      throw new NotFoundException("Файл не найден");
    }

    await this._deleteFileFromServer(file.url);

    return await this._fileRepository.delete(id).then(res => !!res.affected);
  }

  private async _deleteFileFromServer(url: string) {
    try {
      await fs.readdir(config.server.filesFolderPath);

      const file = url.split("/")?.[1];

      if (file) {
        await fs.unlink(path.join(config.server.filesFolderPath, file));
      }
    } catch (e) {
      logger.error({ err: e, url }, "Error deleting file from server");
      throw e;
    }
  }
}
