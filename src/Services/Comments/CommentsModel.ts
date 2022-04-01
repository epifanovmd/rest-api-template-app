import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../db/db";
import { BaseDto } from "../../dto/BaseDto.g";

export interface Comment {
  comment: string;
}

export interface CommentDto extends BaseDto, Comment {}

export class Comments extends Model {
  id: string;
  comment: string;
  UserId: string;
  PostId: string;

  // timestamps!
  private readonly createdAt: Date | string;
  private readonly updatedAt: Date | string;
}

Comments.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    comment: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    UserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    PostId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Comments",
  },
);

Comments.sync({ force: false }).then();
