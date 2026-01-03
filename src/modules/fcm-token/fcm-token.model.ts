import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { sequelize } from "../../core";

export interface FcmTokenDto {
  id: number;
  userId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FcmTokenRequest {
  token: string;
}

export type FcmTokenModel = InferAttributes<FcmToken>;
export type FcmTokenCreateModel = InferCreationAttributes<
  FcmToken,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class FcmToken
  extends Model<FcmTokenModel, FcmTokenCreateModel>
  implements FcmTokenDto
{
  declare id: number;

  declare userId: string;
  declare token: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

FcmToken.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    userId: {
      type: DataTypes.UUID(),
    },

    token: {
      type: DataTypes.STRING(200),
      unique: true,
    },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    timestamps: true,
    modelName: "fcm-token",
    name: {
      singular: "fcmToken",
      plural: "fcmTokens",
    },
  },
);
