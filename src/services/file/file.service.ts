import fs from "fs";
import { inject, injectable } from "inversify";
import path from "path";
import { File } from "tsoa";
import { v4 } from "uuid";

import { SERVER_FILES_FOLDER_PATH } from "../../../config";
import { ApiError } from "../../common";
import { RedisService } from "../redis";
import { IFileDto } from "./file.types";

@injectable()
export class FileService {
  constructor(@inject(RedisService) private _redisService: RedisService) {}

  async getFileById(id: string): Promise<IFileDto> {
    const file = await this._redisService.get<IFileDto>(id);

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

        return this._redisService.set(id, {
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

    return this._redisService.delete(id);
  }

  private _deleteMediaFromServer(url: string) {
    try {
      fs.readdir(SERVER_FILES_FOLDER_PATH, err => {
        if (err) {
          throw Promise.resolve(err);
        }

        const file = url.split("/")?.[1];

        fs.unlink(path.join(SERVER_FILES_FOLDER_PATH, file), err => {
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
