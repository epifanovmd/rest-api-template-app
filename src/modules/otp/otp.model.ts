import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { sequelize } from "../../db";
import { ListResponse } from "../../dto/ListResponse";
import { Profile } from "../profile/profile.model";

export interface IOtpUpdateRequest extends Omit<TOtpCreateModel, "profileId"> {}

export interface IOtpDto extends OtpModel {}

export interface IOtpListDto extends ListResponse<IOtpDto[]> {}

export type OtpModel = InferAttributes<Otp>;
export type TOtpCreateModel = InferCreationAttributes<
  Otp,
  { omit: "createdAt" | "updatedAt" }
>;

export class Otp extends Model<OtpModel, TOtpCreateModel> {
  declare profileId: string;
  declare code: string;

  // timestamps!
  declare expireAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Otp.init(
  {
    profileId: {
      type: DataTypes.UUID,
      references: {
        model: Profile,
        key: "id",
      },
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
