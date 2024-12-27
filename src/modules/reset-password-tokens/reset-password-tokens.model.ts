import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { ListResponse } from "../../dto/ListResponse";
import { Profile } from "../profile/profile.model";

export interface IResetPasswordTokensUpdateRequest
  extends Omit<TResetPasswordTokensCreateModel, "profileId"> {}

export interface IResetPasswordTokensDto
  extends ResetPasswordTokensTokensModel {}

export interface IResetPasswordTokensListDto
  extends ListResponse<IResetPasswordTokensDto[]> {}

export type ResetPasswordTokensTokensModel =
  InferAttributes<ResetPasswordTokens>;
export type TResetPasswordTokensCreateModel = InferCreationAttributes<
  ResetPasswordTokens,
  { omit: "createdAt" | "updatedAt" }
>;

export class ResetPasswordTokens extends Model<
  ResetPasswordTokensTokensModel,
  TResetPasswordTokensCreateModel
> {
  declare profileId: string;
  declare token: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ResetPasswordTokens.init(
  {
    profileId: {
      type: DataTypes.UUID,
      references: {
        model: Profile,
        key: "id",
      },
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
