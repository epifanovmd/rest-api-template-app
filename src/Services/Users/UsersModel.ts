import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../db/db";
import { BaseDto } from "../../dto/BaseDto.g";
import { Comments } from "../Comments/CommentsModel";
import { Posts } from "../Posts/PostsModel";

export interface UserDto extends BaseDto {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Registration {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface Login {
  username: string;
  password: string;
}

export interface UpdateUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export class Users extends Model {
  public username: string;
  public firstName: string;
  public lastName: string;
  public email: string;
  public passwordHash: string;
  public salt: string;
  public role: string;
  public id: string;

  // timestamps!
  private readonly createdAt: Date | string;
  private readonly updatedAt: Date | string;
}

Users.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(15),
      allowNull: true,
      validate: {
        len: [5, 10],
      },
    },
    firstName: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    salt: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Users",
    indexes: [
      {
        unique: true,
        fields: ["username"],
      },
    ],
  },
);
Users.sync({ force: false }).then(() => {
  Users.hasMany(Comments);
  Users.hasMany(Posts);
});
