import { NotFoundException } from "@force-dev/utils";
import fs from "fs";
import { inject, injectable } from "inversify";
import path from "path";
import sharp from "sharp";
import { File } from "tsoa";
import { v4 } from "uuid";

import { config } from "../../config";
import { Injectable, logger } from "../../core";
import { FileRepository } from "./file.repository";

@Injectable()
export class FileService {
  constructor(
    @inject(FileRepository) private _fileRepository: FileRepository,
  ) {}

  async getFileById(id: string) {
    const file = await this._fileRepository.findById(id);

    if (!file) {
      throw new NotFoundException("Файл не найден");
    }

    return file.toDTO();
  }

  async uploadFile(files: File[]) {
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
      fs.readdir(config.server.filesFolderPath, err => {
        if (err) {
          throw err;
        }

        const file = url.split("/")?.[1];

        if (file) {
          fs.unlink(path.join(config.server.filesFolderPath, file), err => {
            if (err) {
              throw err;
            }
          });
        }
      });
    } catch (e) {
      logger.error({ err: e, url }, "Error deleting file from server");
      throw e;
    }
  }
}
