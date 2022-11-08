import {
  Controller,
  Delete,
  File,
  Get,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
  UploadedFile,
} from "tsoa";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { BasePageResult } from "../../dto/BasePageResult";
import { KoaRequest } from "../../types/koa";
import { IMediaDto } from "./MediaModel";
import { MediaService } from "./MediaService";
import { genId } from "../../common/generateId";
import * as fs from "fs";
import path from "path";

const { getMediaById, createMedia, deleteMedia } = new MediaService();

@Tags("Media")
@Route("api/media")
export class MediaController extends Controller {
  @Get()
  getMediaById(
    @Request() req: KoaRequest,
    @Query("id") id: number,
  ): Promise<BasePageResult<IMediaDto>> {
    try {
      return getMediaById(id).then(result => ({
        data: result,
      }));
    } catch (e) {
      return Promise.reject(
        new ApiError(500, ErrorType.DataBaseErrorException, e.message),
      );
    }
  }

  @Post()
  createMedia(
    @Request() req: KoaRequest,
    @UploadedFile() file: File,
  ): Promise<BasePageResult<IMediaDto>> {
    try {
      const name = file.originalname;
      const type = file.mimetype;
      const url = file.path;
      const size = file.size;

      return createMedia(genId(), { name, url, size, type }).then(result => ({
        data: result,
      }));
    } catch (e) {
      return Promise.reject(
        new ApiError(500, ErrorType.DataBaseErrorException, e.message),
      );
    }
  }

  @Security("jwt")
  @Delete("/{id}")
  async deleteMedia(id: number): Promise<number> {
    try {
      const directory = "./media";

      const err = await getMediaById(id).then(res => {
        try {
          fs.readdir(directory, (err, files) => {
            if (err) {
              return Promise.resolve(err);
            }

            const file = res.url.split("/")?.[1];

            fs.unlink(path.join(directory, file), err => {
              if (err) {
                return Promise.resolve(err);
              }
            });
          });
        } catch (e) {
          return Promise.resolve(err);
        }

        return Promise.resolve(undefined);
      });

      if (err) {
        return Promise.reject(
          new ApiError(
            500,
            ErrorType.ServerErrorException,
            "Ошибка удаления файла на сервере",
          ),
        );
      }

      return deleteMedia(id);
    } catch (e) {
      return Promise.reject(
        new ApiError(500, ErrorType.DataBaseErrorException, e.message),
      );
    }
  }
}
