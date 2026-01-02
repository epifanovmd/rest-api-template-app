import { NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { Includeable } from "sequelize/types/model";

import { Injectable } from "../../core";
import { SocketService } from "../socket";
import { UserService } from "../user";
import { User } from "../user/user.model";
import { DialogMembers } from "./dialog-members.model";

@Injectable()
export class DialogMembersService {
  constructor(@inject(SocketService) private _socketService: SocketService) {}

  getMembers = async (dialogId: string) => {
    return DialogMembers.findAll({
      where: { dialogId },
      include: this._include,
    });
  };

  addMembers = async ({
    userId,
    dialogId,
    members,
  }: {
    userId?: string;
    dialogId: string;
    members: string[];
  }) => {
    // Проверка может ли этот пользователь добавлять участников в диалог
    if (userId) {
      const member = await DialogMembers.findOne({
        where: {
          userId: userId,
          dialogId: dialogId,
        },
      });

      if (!member) {
        return Promise.reject(new NotFoundException("Диалог не найден"));
      }
    }

    const created = await DialogMembers.bulkCreate(
      members.map(userId => ({
        userId,
        dialogId,
      })),
      { ignoreDuplicates: true, returning: true },
    );

    created.forEach(item => {
      const client = this._socketService.getClient(item.userId);

      if (client) {
        client.emit("newDialog", dialogId);
      }
    });

    return this.getMembers(dialogId);
  };

  deleteMember = async (id: string) => {
    const member = await DialogMembers.findByPk(id);

    if (!member) {
      return Promise.reject(new NotFoundException("Участник не найден"));
    }

    const client = this._socketService.getClient(member.userId);

    if (client) {
      client.emit("deleteDialog", member.dialogId);
    }

    return member.destroy();
  };

  private get _include(): Includeable[] {
    return [
      {
        model: User,
        attributes: UserService.attributes,
        include: UserService.include,
      },
    ];
  }
}
