import { NotFoundException } from "@force-dev/utils";
import fs from "fs/promises";
import { inject } from "inversify";
import path from "path";
import sharp from "sharp";
import { File } from "tsoa";
import { v4 } from "uuid";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import { FileUploadedEvent } from "./events";
import { FileRepository } from "./file.repository";

@Injectable()
export class FileService {
  constructor(
    @inject(FileRepository) private _fileRepository: FileRepository,
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

        let thumbnailUrl: string | null = null;
        let width: number | null = null;
        let height: number | null = null;

        // Generate thumbnail for images
        if (file.mimetype.startsWith("image/")) {
          try {
            const image = sharp(file.path);
            const metadata = await image.metadata();

            width = metadata.width ?? null;
            height = metadata.height ?? null;

            const thumbFilename = `${id}_thumb.webp`;
            const thumbPath = path.join(
              path.dirname(file.path),
              thumbFilename,
            );

            await image
              .resize(200, 200, { fit: "inside", withoutEnlargement: true })
              .webp({ quality: 70 })
              .toFile(thumbPath);

            const urlDir = path.dirname(file.path);
            const relThumbUrl = path.join(
              path.basename(urlDir),
              thumbFilename,
            );

            thumbnailUrl = `/${relThumbUrl}`;
          } catch (err) {
            logger.error({ err }, "Failed to generate thumbnail");
          }
        }

        return this._fileRepository.createAndSave({
          id,
          name: file.originalname,
          type: file.mimetype,
          url: file.path,
          size: file.size,
          thumbnailUrl,
          width,
          height,
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
