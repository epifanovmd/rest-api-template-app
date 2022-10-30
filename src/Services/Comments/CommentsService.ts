import { WhereOptions } from "sequelize";
import { v1 as uuid } from "uuid";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { Comment, Comments } from "./CommentsModel";

export interface IGetCommentsOptions {
  UserId?: string;
  page?: number;
  limit?: number;
  my?: boolean;
  PostId?: string;
}

export class CommentsService {
  getComments = ({ UserId, page, limit, my, PostId }: IGetCommentsOptions) =>
    Comments.findAll({
      limit,
      offset: limit ? page && (page > 0 ? page - 1 : page) * limit : undefined,
      order: [["createdAt", "DESC"]],
      where: {
        ...(my && UserId ? { UserId } : {}),
        ...(PostId ? { PostId } : {}),
      },
    });

  getCommentsByAttr = (where: WhereOptions) =>
    Comments.findOne({ where }).then(
      result => {
        if (result === null) {
          return Promise.reject(
            new ApiError(
              400,
              ErrorType.UserNotFoundException,
            ),
          );
        }

        return Promise.resolve(result);
      },
      e =>
        Promise.reject(
          new ApiError(
            500,
            ErrorType.DataBaseErrorException,
            e.message,
          ),
        ),
    );

  getCommentsById = (id: number | string) =>
    Comments.findByPk(id, {}).then(
      result => {
        if (result === null) {
          return Promise.reject(
            new ApiError(
              400,
              ErrorType.UserNotFoundException,
            ),
          );
        }

        return Promise.resolve(result);
      },
      e =>
        Promise.reject(
          new ApiError(
            500,
            ErrorType.DataBaseErrorException,
            e.message,
          ),
        ),
    );
  createComment = (body: Comment, UserId: string, PostId: string) =>
    Comments.create({
      ...body,
      PostId,
      UserId,
      id: uuid(),
    }).catch(e =>
      Promise.reject(
        new ApiError(
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      ),
    );

  updateComment = async (
    id: number | string,
    body: Comment,
    userId: string,
  ) => {
    const { id: commentId, UserId } = await this.getCommentsById(id);

    if (UserId === userId) {
      return Comments.update(body, { where: { id } }).then(
        () => this.getCommentsById(commentId),
        e =>
          Promise.reject(
            new ApiError(
              500,
              ErrorType.DataBaseErrorException,
              e.message,
            ),
          ),
      );
    }

    return Promise.reject(
      new ApiError( 403, ErrorType.AccessRestrictedException),
    );
  };

  deleteComment = async (id: number | string, userId: string) => {
    const { id: commentId, UserId } = await this.getCommentsById(id);

    if (UserId === userId) {
      return Comments.destroy({ where: { id } }).catch(e =>
        Promise.reject(
          new ApiError(
            500,
            ErrorType.DataBaseErrorException,
            e.message,
          ),
        ),
      );
    }

    return Promise.reject(
      new ApiError(403, ErrorType.AccessRestrictedException),
    );
  };
}
