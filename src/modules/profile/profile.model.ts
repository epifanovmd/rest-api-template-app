import {
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { ListResponse } from "../../dto/ListResponse";
import { IRoleDto, Role } from "../role";

export interface IProfileUpdateRequest
  extends Omit<TProfileCreateModel, "id" | "passwordHash"> {}

export interface IProfileDto extends Omit<ProfileModel, "passwordHash"> {
  role: IRoleDto;
}

export interface IProfileListDto extends ListResponse<IProfileDto[]> {}

export type ProfileModel = InferAttributes<Profile>;
export type TProfileCreateModel = InferCreationAttributes<
  Profile,
  { omit: "createdAt" | "updatedAt" | "id" }
>;

export class Profile extends Model<ProfileModel, TProfileCreateModel> {
  declare id: string;

  declare username: string;
  declare firstName?: string;
  declare lastName?: string;
  declare email?: string;
  declare phone?: string;

  declare passwordHash: string;
  declare roleId?: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // mixins
  declare setRole: BelongsToSetAssociationMixin<Role, number>;
  declare getRole: BelongsToGetAssociationMixin<Role>;

  // associations
  declare role: NonAttribute<Role>;
}

Profile.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
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

    roleId: {
      type: DataTypes.UUID,
      references: {
        model: Role,
        key: "id",
      },
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
