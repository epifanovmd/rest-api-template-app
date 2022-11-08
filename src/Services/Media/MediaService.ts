import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { Media, IMediaRequest } from "./MediaModel";

export class MediaService {
  getMediaById = (id: number) =>
    Media.findByPk(id).then(
      result => {
        if (result === null) {
          return Promise.reject(
            new ApiError(404, ErrorType.MediaNotFoundException),
          );
        }

        return result;
      },
      e =>
        Promise.reject(
          new ApiError(500, ErrorType.DataBaseErrorException, e.message),
        ),
    );
  createMedia = (id: number, body: IMediaRequest) =>
    Media.create(
      {
        id,
        ...body,
      },
      {},
    ).catch(e =>
      Promise.reject(
        new ApiError(500, ErrorType.DataBaseErrorException, e.message),
      ),
    );

  updateMedia = async (id: number, body: IMediaRequest) => {
    const { id: mediaId } = await this.getMediaById(id);

    return Media.update(body, {
      where: { id: mediaId },
    }).then(
      () => this.getMediaById(mediaId),
      e =>
        Promise.reject(
          new ApiError(500, ErrorType.DataBaseErrorException, e.message),
        ),
    );
  };

  deleteMedia = (id: number) =>
    Media.destroy({ where: { id } }).catch(e =>
      Promise.reject(
        new ApiError(500, ErrorType.DataBaseErrorException, e.message),
      ),
    );
}
