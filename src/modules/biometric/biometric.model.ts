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
import { User } from "../user/user.model";

export interface IBiometricDto extends BiometricModel {}

export interface IRegisterBiometricRequest {
  userId: string;
  deviceId: string;
  deviceName: string;
  publicKey: string;
}

export interface IRegisterBiometricResponse {
  registered: boolean;
}

export interface IGenerateNonceRequest {
  userId: string;
}

export interface IGenerateNonceResponse {
  nonce: string;
}

export interface IVerifyBiometricSignatureRequest {
  userId: string;
  deviceId: string;
  signature: string;
}

export interface IVerifyBiometricSignatureResponse {
  verified: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export type BiometricModel = InferAttributes<Biometric>;
export type TBiometricCreateModel = InferCreationAttributes<
  Biometric,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class Biometric extends Model<BiometricModel, TBiometricCreateModel> {
  declare id: string;

  declare userId: string;
  declare deviceId: string;
  declare publicKey: string;
  declare deviceName?: string;
  declare lastUsedAt?: Date;
  declare createdAt: Date;
  declare updatedAt: Date;

  // Sequelize mixins
  declare getUser: BelongsToGetAssociationMixin<User>;
  declare setUser: BelongsToSetAssociationMixin<User, string>;

  declare user: NonAttribute<User>;
}

Biometric.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    deviceId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    deviceName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "biometric",
    name: {
      singular: "biometric",
      plural: "biometrics",
    },
    indexes: [
      {
        unique: true,
        fields: ["userId", "deviceId"], // один ключ на одно устройство на одного пользователя
      },
    ],
  },
);
