import {
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  DataTypes,
  HasManyGetAssociationsMixin,
  HasOneGetAssociationMixin,
  HasOneSetAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { ListResponse, sequelize } from "../../core";
import { Biometric } from "../biometric/biometric.model";
import { Passkeys } from "../passkeys/passkeys.model";
import { EPermissions } from "../permission/permission.model";
import { Profile } from "../profile/profile.model";
import { ERole, IRoleDto, Role } from "../role/role.model";

export interface IUserUpdateRequest {
  email?: string;
  phone?: string;
  roleId?: string;
  challenge?: string;
}

export interface IUserPrivilegesRequest {
  roleName: ERole;
  permissions: EPermissions[];
}

export interface IUserDto {
  id: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  challenge?: string;
  createdAt: Date;
  updatedAt: Date;
  role: IRoleDto;
}

export interface IUserListDto extends ListResponse<IUserDto[]> {}

export interface IUserPassword {
  password: string;
}

export type UserModel = InferAttributes<User>;
export type UserCreateModel = InferCreationAttributes<
  User,
  { omit: "id" | "emailVerified" | "createdAt" | "updatedAt" }
>;

export class User
  extends Model<UserModel, UserCreateModel>
  implements IUserDto
{
  // Аутентификация
  declare id: string;
  declare email?: string;
  declare emailVerified?: boolean;
  declare phone?: string;
  declare passwordHash: string;
  declare challenge?: string;

  // Безопасность
  declare roleId?: string;
  declare setRole: BelongsToSetAssociationMixin<Role, string>;
  declare getRole: BelongsToGetAssociationMixin<Role>;

  // Системное
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Биометрия
  declare getPasskeys: HasManyGetAssociationsMixin<Passkeys>;
  declare getBiometrics: HasManyGetAssociationsMixin<Biometric>;

  // associations
  declare role: NonAttribute<Role>;
  declare biometrics: NonAttribute<Biometric[]>;

  // Связь с профилем
  declare getProfile: HasOneGetAssociationMixin<Profile>;
  declare setProfile: HasOneSetAssociationMixin<Profile, string>;

  toDTO(): IUserDto {
    return {
      id: this.id,
      email: this.email,
      emailVerified: this.emailVerified,
      phone: this.phone,
      challenge: this.challenge,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      role: this.role.toDTO(),
    };
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isEmail: true,
      },
      unique: true, // Добавить уникальность
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
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "users",
    name: {
      singular: "user",
      plural: "users",
    },
    indexes: [
      {
        unique: true,
        fields: ["email", "phone"],
      },
    ],
  },
);
