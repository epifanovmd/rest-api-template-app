import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { Files, IFileDto } from "../file/file.model";

export type TMessageFileType = "image" | "video" | "audio";

export interface IMessageFileDto {
  id: string;
  messageId: string;
  fileId: string;
  fileType: TMessageFileType;
  createdAt: Date;
  updatedAt: Date;
  file: IFileDto;
}

export class MessageFiles
  extends Model<
    InferAttributes<MessageFiles>,
    InferCreationAttributes<MessageFiles>
  >
  implements IMessageFileDto
{
  declare id: string;
  declare messageId: string;
  declare fileId: string;
  declare fileType: TMessageFileType;

  // timestamps
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // associations
  declare file: NonAttribute<Files>;
}

MessageFiles.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fileType: {
      type: DataTypes.ENUM("image", "video", "audio"),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "message-files",
    name: {
      singular: "messageFile",
      plural: "messageFiles",
    },
    timestamps: true,
  },
);
