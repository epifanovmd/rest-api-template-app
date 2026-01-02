import {
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { ListResponse } from "../../core";
import { sequelize } from "../../db";
import { Files, IFileDto } from "../file/file.model";
import { User } from "../user/user.model";

export interface IProfileUpdateRequest {
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  gender?: string;
  status?: string;
}

export interface IProfileDto {
  id: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date | null;
  gender?: string;
  status?: string;
  lastOnline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  avatar: IFileDto | null;
}

export interface IProfileListDto extends ListResponse<IProfileDto[]> {}

export type ProfileModel = InferAttributes<Profile>;
export type ProfileCreateModel = InferCreationAttributes<
  Profile,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class Profile
  extends Model<ProfileModel, ProfileCreateModel>
  implements IProfileDto
{
  declare id: string;
  declare userId: string; // FK to User

  // Персональные данные
  declare firstName?: string;
  declare lastName?: string;
  declare birthDate?: Date | null;
  declare gender?: string;

  // Онлайн-статус
  declare status?: string;
  declare lastOnline?: Date | null;

  // Аватар
  declare avatarId?: string | null;
  declare setAvatar: BelongsToSetAssociationMixin<Files, string>;
  declare getAvatar: BelongsToGetAssociationMixin<Files>;
  declare avatar: NonAttribute<Files | null>;

  // Таймстампы
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Связь с пользователем
  declare setUser: BelongsToSetAssociationMixin<User, string>;
  declare getUser: BelongsToGetAssociationMixin<User>;
  declare user: NonAttribute<User>;
}

Profile.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID(),
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    birthDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lastOnline: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    avatarId: {
      type: DataTypes.UUID(),
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "profiles",
    name: {
      singular: "profile",
      plural: "profiles",
    },
    indexes: [
      {
        fields: ["userId"],
        unique: true, // Один профиль на пользователя
      },
      {
        fields: ["lastOnline"], // Для быстрого поиска активных пользователей
      },
    ],
  },
);
