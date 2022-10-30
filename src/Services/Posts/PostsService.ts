import { WhereOptions } from "sequelize";
import { v1 as uuid } from "uuid";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { Comments } from "../Comments/CommentsModel";
import { IPost, Posts } from "./PostsModel";

export class PostsService {
  getPosts = ({
    UserId,
    page,
    limit,
    my,
  }: {
    UserId?: string;
    page?: number;
    limit?: number;
    my?: boolean;
  }) =>
    Posts.findAll({
      limit,
      offset: limit ? page && (page > 0 ? page - 1 : page) * limit : undefined,
      order: [["createdAt", "DESC"]],
      where: {
        ...(my && UserId ? { UserId } : {}),
      },
      include: [
        {
          model: Comments,
        },
      ],
    });

  getPostsByAttr = (where: WhereOptions) =>
    Posts.findOne({
      where,
      include: [
        {
          model: Comments,
        },
      ],
    }).then(
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

  getPostsById = (id: number | string) =>
    Posts.findByPk(id, {
      include: [
        {
          model: Comments,
        },
      ],
    }).then(
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
  createPost = (body: IPost, UserId: string) =>
    Posts.create(
      {
        ...body,
        UserId,
        id: uuid(),
      },
      {
        include: [
          {
            model: Comments,
          },
        ],
      },
    ).catch(e =>
      Promise.reject(
        new ApiError(
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      ),
    );

  updatePost = async (id: number | string, body: IPost, userId: string) => {
    const { id: postId, UserId } = await this.getPostsById(id);

    if (UserId === userId) {
      return Posts.update(body, {
        where: { id: postId },
      }).then(
        () => this.getPostsById(postId),
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
      new ApiError(403, ErrorType.AccessRestrictedException),
    );
  };

  deletePost = async (id: number | string, userId: string) => {
    const { id: postId, UserId } = await this.getPostsById(id);

    if (UserId === userId) {
      return Posts.destroy({ where: { id } }).catch(e =>
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
