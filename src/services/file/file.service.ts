import fs from "fs";
import { inject, injectable } from "inversify";
import path from "path";
import { File } from "tsoa";
import { v4 } from "uuid";

import { config } from "../../../config";
import { ApiError } from "../../common";
import { RedisService } from "../redis";
import { IFileDto } from "./file.types";

const redisService = new RedisService();

// @injectable()
export class FileService {
  constructor() {}

  async getFileById(id: string): Promise<IFileDto> {
    const file = await redisService.get<IFileDto>(id);

    if (!file) {
      throw new ApiError("Файл не найден", 404);
    }

    return file;
  }

  uploadFile(files: File[]) {
    return Promise.all(
      files.map(file => {
        const name = file.originalname;
        const type = file.mimetype;
        const url = file.path;
        const size = file.size;

        const id = v4();

        return redisService.set(id, {
          id,
          name,
          type,
          url,
          size,
        });
      }),
    );
  }

  async deleteFile(id: string): Promise<number> {
    const { url } = await this.getFileById(id);

    await this._deleteMediaFromServer(url);

    return redisService.delete(id);
  }

  private _deleteMediaFromServer(url: string) {
    try {
      fs.readdir(config.SERVER_FILES_FOLDER_PATH, err => {
        if (err) {
          throw Promise.resolve(err);
        }

        const file = url.split("/")?.[1];

        fs.unlink(path.join(config.SERVER_FILES_FOLDER_PATH, file), err => {
          if (err) {
            throw Promise.resolve(err);
          }
        });
      });
    } catch (e) {
      return Promise.resolve(e);
    }
  }
}
