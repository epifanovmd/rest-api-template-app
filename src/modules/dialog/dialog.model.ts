import {
  DataTypes,
  HasManyAddAssociationMixin,
  HasManyAddAssociationsMixin,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  HasManyHasAssociationMixin,
  HasManyHasAssociationsMixin,
  HasManyRemoveAssociationMixin,
  HasManyRemoveAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { sequelize } from "../../db";
import { ListResponse } from "../../dto/ListResponse";
import {
  DialogMembers,
  DialogMembersDto,
} from "../dialog-members/dialog-members.model";
import {
  DialogMessages,
  IDialogMessagesDto,
} from "../dialog-messages/dialog-messages.model";
import { IUserDto, User } from "../user/user.model";

export interface DialogDto {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: IUserDto;
  members: DialogMembersDto[];
  lastMessage: IDialogMessagesDto[] | null;
  unreadMessagesCount: number;
}

export interface IDialogListDto extends ListResponse<DialogDto[]> {}

export interface DialogCreateRequest {
  recipientId: string[];
}

export interface DialogFindRequest {
  recipientId: string[];
}

export type DialogModel = InferAttributes<Dialog>;
export type DialogCreateModel = InferCreationAttributes<
  Dialog,
  { omit: "id" | "createdAt" | "updatedAt" }
>;

export class Dialog
  extends Model<DialogModel, DialogCreateModel>
  implements DialogDto
{
  declare id: string;

  declare ownerId: string;

  // timestamps!
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // associations
  declare owner: NonAttribute<User>;
  declare members: NonAttribute<DialogMembers[]>;
  declare lastMessage: NonAttribute<DialogMessages[] | null>;
  declare unreadMessagesCount: NonAttribute<number>;

  // mixins
  declare addMember: HasManyAddAssociationMixin<DialogMembers, string>;
  declare addMembers: HasManyAddAssociationsMixin<DialogMembers, string>;
  declare getMembers: HasManyGetAssociationsMixin<DialogMembers>;
  declare countMembers: HasManyCountAssociationsMixin;
  declare hasMember: HasManyHasAssociationMixin<DialogMembers, string>;
  declare hasMembers: HasManyHasAssociationsMixin<DialogMembers, string>;
  declare removeMember: HasManyRemoveAssociationMixin<DialogMembers, string>;
  declare removeMembers: HasManyRemoveAssociationsMixin<DialogMembers, string>;
  declare createMember: HasManyCreateAssociationMixin<DialogMembers>;
}

Dialog.init(
  {
    id: {
      type: DataTypes.UUID(),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    ownerId: {
      type: DataTypes.UUID(),
      allowNull: false,
    },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "dialog",
    name: {
      singular: "dialog",
      plural: "dialogs",
    },
  },
);
