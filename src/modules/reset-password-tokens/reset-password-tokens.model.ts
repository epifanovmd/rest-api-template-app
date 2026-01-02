import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { ListResponse } from "../../core";
import { sequelize } from "../../db";
import { User } from "../user/user.model";

export interface IResetPasswordTokensUpdateRequest
  extends Omit<TResetPasswordTokensCreateModel, "userId"> {}

export interface IResetPasswordTokensDto {
  userId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IResetPasswordTokensListDto
  extends ListResponse<IResetPasswordTokensDto[]> {}

export type ResetPasswordTokensTokensModel =
  InferAttributes<ResetPasswordTokens>;
export type TResetPasswordTokensCreateModel = InferCreationAttributes<
  ResetPasswordTokens,
  { omit: "createdAt" | "updatedAt" }
>;

export class ResetPasswordTokens
  extends Model<ResetPasswordTokensTokensModel, TResetPasswordTokensCreateModel>
  implements IResetPasswordTokensDto
{
  declare userId: string;
  declare token: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ResetPasswordTokens.init(
  {
    userId: {
      type: DataTypes.UUID,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "reset-password-tokens",
    name: {
      singular: "reset-password-token",
      plural: "reset-password-tokens",
    },
  },
);
