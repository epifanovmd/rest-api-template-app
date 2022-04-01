import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../db/db";
import { BaseDto } from "../../dto/BaseDto.g";
import { Comments } from "../Comments/CommentsModel";

export interface PostDto extends BaseDto {
  name: string;
  subject: string;
  body: string;
}

export interface IPost {
  name: string;
  subject: string;
  body: string;
}

export class Posts extends Model {
  id: string;
  name: string;
  subject: string;
  body: string;
  UserId: string;

  // timestamps!
  private readonly createdAt: Date | string;
  private readonly updatedAt: Date | string;
}

Posts.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(15),
      allowNull: true,
      validate: {
        len: [5, 10],
      },
    },
    subject: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    UserId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    body: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Posts",
  },
);

Posts.sync({ force: false }).then(() => {
  Posts.hasMany(Comments);
});
