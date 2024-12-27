import {
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  DataTypes,
  HasManyGetAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { ListResponse } from "../../dto/ListResponse";
import { Passkeys } from "../passkeys/passkeys.model";
import { EPermissions } from "../permission/permission.model";
import { ERole, IRoleDto, Role } from "../role/role.model";

export interface IProfileUpdateRequest
  extends Omit<TProfileCreateModel, "id" | "passwordHash"> {}

export interface IProfilePrivilegesRequest {
  roleName: ERole;
  permissions: EPermissions[];
}

export interface IProfileDto extends Omit<ProfileModel, "passwordHash"> {
  role: IRoleDto;
}

export interface IProfileListDto extends ListResponse<IProfileDto[]> {}

export type ProfileModel = InferAttributes<Profile>;
export type TProfileCreateModel = InferCreationAttributes<
  Profile,
  { omit: "id" | "emailVerified" | "createdAt" | "updatedAt" }
>;

export class Profile extends Model<ProfileModel, TProfileCreateModel> {
  declare id: string;

  declare firstName?: string;
  declare lastName?: string;
  declare email?: string;
  declare emailVerified?: boolean;
  declare phone?: string;

  declare passwordHash: string;

  declare roleId?: string;
  declare challenge?: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // mixins
  declare setRole: BelongsToSetAssociationMixin<Role, string>;
  declare getRole: BelongsToGetAssociationMixin<Role>;

  // mixins
  declare getPasskeys: HasManyGetAssociationsMixin<Passkeys>;

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
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    phone: {
      type: DataTypes.STRING(14),
      allowNull: true,
    },
    passwordHash: {
      type: DataTypes.STRING(100),
    },

    challenge: {
      type: DataTypes.STRING,
      allowNull: true,
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
        fields: ["email", "phone"],
      },
    ],
  },
);
