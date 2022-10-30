import { WhereOptions } from "sequelize";
import sha256 from "sha256";
import { v1 as uuid } from "uuid";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { Posts } from "../Posts/PostsModel";
import { Registration, UpdateUser, Users } from "./UsersModel";

export class UsersService {
  getAllUsers = (page?: number, limit?: number) =>
    Users.findAll({
      limit,
      attributes: ["id", "username", "firstName", "lastName", "email"],
      offset: limit ? page && (page > 0 ? page - 1 : page) * limit : undefined,
      order: [["createdAt", "DESC"]],
    });

  getUsersByAttr = (where: WhereOptions) =>
    Users.findOne({ where }).then(
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

  getUsersById = (id: number | string) =>
    Users.findByPk(id, {
      attributes: ["id", "username", "firstName", "lastName", "email", "role"],
      include: [
        {
          model: Posts,
          required: false,
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

  createUser = (body: Registration) => {
    const { password } = body;
    const salt = uuid();

    return Users.create({
      ...body,
      id: uuid(),
      salt,
      passwordHash: sha256(password + salt),
      role: "User",
    }).catch(e =>
      Promise.reject(
        new ApiError(
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      ),
    );
  };

  updateUser = (id: number | string, body: UpdateUser) =>
    Users.update(body, { where: { id } }).then(
      () => this.getUsersById(id),
      e =>
        Promise.reject(
          new ApiError(
            500,
            ErrorType.DataBaseErrorException,
            e.message,
          ),
        ),
    );

  deleteUser = (id: number | string) =>
    Users.destroy({ where: { id } }).catch(e =>
      Promise.reject(
        new ApiError(
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      ),
    );
}
