import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { ListResponse } from "../../core";
import { sequelize } from "../../db";

export interface IOtpUpdateRequest extends Omit<TOtpCreateModel, "userId"> {}

export interface IOtpDto {
  userId: string;
  code: string;
  expireAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOtpListDto extends ListResponse<IOtpDto[]> {}

export type OtpModel = InferAttributes<Otp>;
export type TOtpCreateModel = InferCreationAttributes<
  Otp,
  { omit: "createdAt" | "updatedAt" }
>;

export class Otp extends Model<OtpModel, TOtpCreateModel> implements IOtpDto {
  declare userId: string;
  declare code: string;

  // timestamps!
  declare expireAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Otp.init(
  {
    userId: {
      type: DataTypes.UUID,
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },

    expireAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "otp",
    name: {
      singular: "otp",
      plural: "otp",
    },
  },
);
