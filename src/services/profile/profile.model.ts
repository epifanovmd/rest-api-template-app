import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { sequelize } from "../../db/db";
import { ListResponse } from "../../dto/ListResponse";

export interface IProfileUpdateRequest
  extends Omit<TProfileCreateModel, "id" | "passwordHash"> {}
export interface IProfileDto extends Omit<ProfileModel, "passwordHash"> {}
export interface IProfileListDto extends ListResponse<IProfileDto[]> {}

export type ProfileModel = InferAttributes<Profile>;
export type TProfileCreateModel = InferCreationAttributes<
  Profile,
  { omit: "createdAt" | "updatedAt" }
>;

export class Profile extends Model<ProfileModel, TProfileCreateModel> {
  declare id: string;

  declare username: string;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare phone: string;

  declare passwordHash: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // associations
}

Profile.init(
  {
    id: {
      type: DataTypes.UUID(),
      primaryKey: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(40),
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
    email: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(14),
      allowNull: true,
    },
    passwordHash: {
      type: DataTypes.STRING(100),
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
        unique: true,
        fields: ["username"],
      },
    ],
  },
);

Profile.sync({ force: false }).then(() => {});
