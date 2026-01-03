import {
  BelongsToManyAddAssociationsMixin,
  BelongsToManyGetAssociationsMixin,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { ListResponse, sequelize } from "../../core";
import { Dialog } from "../dialog/dialog.model";
import { Files, IFileDto } from "../file/file.model";
import { IUserDto, User } from "../user/user.model";

export interface IDialogMessagesDto {
  id: string;
  userId: string;
  dialogId: string;
  text: string;
  system?: boolean;
  sent?: boolean;
  received?: boolean;
  replyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: IUserDto;
  images?: IFileDto[];
  videos?: IFileDto[];
  audios?: IFileDto[];
  reply?: IDialogMessagesDto;
}

export interface IDialogListMessagesDto
  extends ListResponse<IDialogMessagesDto[]> {}

export interface IMessagesRequest {
  dialogId: string;
  text: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
}

export interface IMessagesUpdateRequest {
  text?: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
  deleteFileIds?: string[];
}

export type DialogMessagesModel = InferAttributes<DialogMessages>;
export type MessagesCreateModel = InferCreationAttributes<
  DialogMessages,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class DialogMessages
  extends Model<DialogMessagesModel, MessagesCreateModel>
  implements IDialogMessagesDto
{
  declare id: string;
  declare userId: string;
  declare dialogId: string;
  declare text: string;
  declare system?: boolean;
  declare sent?: boolean;
  declare received?: boolean;
  declare replyId?: string | null;

  // timestamps
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // associations
  declare user: NonAttribute<User>;
  declare images?: NonAttribute<Files[]>;
  declare videos?: NonAttribute<Files[]>;
  declare audios?: NonAttribute<Files[]>;
  declare reply?: NonAttribute<DialogMessages>;
  declare dialog: NonAttribute<Dialog>;

  // Миксины для добавления файлов
  declare addImages: BelongsToManyAddAssociationsMixin<Files, string>;
  declare addVideos: BelongsToManyAddAssociationsMixin<Files, string>;
  declare addAudios: BelongsToManyAddAssociationsMixin<Files, string>;

  // Миксины для получения файлов
  declare getImages: BelongsToManyGetAssociationsMixin<Files>;
  declare getVideos: BelongsToManyGetAssociationsMixin<Files>;
  declare getAudios: BelongsToManyGetAssociationsMixin<Files>;
}

DialogMessages.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dialogId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    replyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "dialog-messages",
    name: {
      singular: "dialogMessage",
      plural: "dialogMessages",
    },
    timestamps: true,
  },
);
