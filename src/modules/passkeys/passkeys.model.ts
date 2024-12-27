import {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  Base64URLString,
  CredentialDeviceType,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { sequelize } from "../../db";
import { ITokensDto } from "../auth";
import { Profile } from "../profile/profile.model";

export interface IVerifyRegistrationRequest {
  profileId: string;
  data: RegistrationResponseJSON;
}

export interface IVerifyAuthenticationRequest {
  profileId: string;
  data: AuthenticationResponseJSON;
}

export interface IVerifyAuthenticationResponse {
  verified: boolean;
  tokens?: ITokensDto;
}

export interface IVerifyRegistrationResponse {
  verified: boolean;
}

export type PasskeysModel = InferAttributes<Passkeys>;
export type TPasskeysCreateModel = InferCreationAttributes<
  Passkeys,
  { omit: "createdAt" | "updatedAt" }
>;

export class Passkeys extends Model<PasskeysModel, TPasskeysCreateModel> {
  declare id: Base64URLString;
  declare publicKey: Uint8Array;
  declare profileId: string;
  declare counter: number;
  declare deviceType: CredentialDeviceType;
  declare transports?: AuthenticatorTransportFuture[];
  declare lastUsed?: Date;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Passkeys.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    publicKey: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    profileId: {
      type: DataTypes.UUID,
      references: {
        model: Profile,
        key: "id",
      },
    },
    counter: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    deviceType: {
      type: DataTypes.STRING, // Замените на правильный тип данных
      allowNull: false,
    },
    transports: {
      type: DataTypes.ARRAY(DataTypes.STRING), // Замените на правильный тип данных
      allowNull: true,
    },
    lastUsed: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: DataTypes.DATE,
  },
  {
    modelName: "passkeys",
    name: {
      singular: "passkey",
      plural: "passkeys",
    },
    sequelize,
    timestamps: false,
    indexes: [
      {
        fields: ["profileId", "id"],
      },
      {
        fields: ["id"],
      },
    ],
  },
);
