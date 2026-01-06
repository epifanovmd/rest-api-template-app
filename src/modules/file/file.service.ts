import { NotFoundException } from "@force-dev/utils";
import fs from "fs";
import { inject, injectable } from "inversify";
import path from "path";
import { File } from "tsoa";
import { v4 } from "uuid";

import { config } from "../../../config";
import { Injectable } from "../../core";
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

        return this._fileRepository.createAndSave({
          id,
          name: file.originalname,
          type: file.mimetype,
          url: file.path,
          size: file.size,
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
      console.error("Error deleting file from server:", e);
      throw e;
    }
  }
}
