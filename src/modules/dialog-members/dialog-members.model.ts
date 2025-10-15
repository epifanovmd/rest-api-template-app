import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { IUserDto, User } from "../user/user.model";

export interface DialogMembersDto {
  id: string;
  userId: string;
  dialogId: string;
  createdAt: Date;
  updatedAt: Date;
  user: IUserDto;
}

export interface DialogMembersAddRequest {
  dialogId: string;
  members: string[];
}

export type DialogMembersModel = InferAttributes<DialogMembers>;
export type DialogMembersCreateModel = InferCreationAttributes<
  DialogMembers,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class DialogMembers
  extends Model<DialogMembersModel, DialogMembersCreateModel>
  implements DialogMembersDto
{
  declare id: string;
  declare userId: string;
  declare dialogId: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // associations
  declare user: NonAttribute<User>;
}

DialogMembers.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID(),
      allowNull: false,
    },
    dialogId: {
      type: DataTypes.UUID(),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "dialog-members",
    name: {
      singular: "member",
      plural: "members",
    },
    indexes: [{ unique: true, fields: ["userId", "dialogId"] }],
  },
);
