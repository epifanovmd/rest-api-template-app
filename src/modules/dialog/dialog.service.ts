import { NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { col, fn, Includeable, Op, Sequelize, where } from "sequelize";

import { Injectable } from "../../decorators/injectable.decorator";
import { DialogMembersService } from "../dialog-members";
import { DialogMembers } from "../dialog-members/dialog-members.model";
import { DialogMessages } from "../dialog-messages/dialog-messages.model";
import { DialogMessagesService } from "../dialog-messages/dialog-messages.service";
import { SocketService } from "../socket";
import { UserService } from "../user";
import { User } from "../user/user.model";
import { Dialog, DialogCreateRequest } from "./dialog.model";

@Injectable()
export class DialogService {
  constructor(
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(SocketService) private _socketService: SocketService,
  ) {}

  getUnreadMessagesCount = (userId: string, dialogId?: string) => {
    return DialogMessages.count({
      where: {
        received: false,
        ...(dialogId ? { dialogId } : {}),
        userId: {
          [Op.not]: userId,
        },
      },
    });
  };

  getDialogs = async (userId: string, offset?: number, limit?: number) => {
    const dialogIds = await DialogMembers.findAll({
      attributes: ["dialogId"],
      where: { userId },
      raw: true,
    }).then(res => res.map(row => row.dialogId)); // Извлекаем массив dialogId

    return await Dialog.findAll({
      offset,
      limit,
      subQuery: false,
      attributes: {
        include: [
          [fn("COUNT", col("dialogMessages.id")), "unreadMessagesCount"],
        ],
      },
      group: [
        "dialog.id",
        "owner.id",
        "owner->role.id",
        "owner->role->permissions.id",
      ],
      where: {
        id: {
          [Op.in]: dialogIds,
        },
      },
      include: DialogService.include(userId),
      order: [
        [
          Sequelize.literal(`(
        SELECT "createdAt"
        FROM "dialog-messages" AS dm
        WHERE dm."dialogId" = "dialog"."id"
        ORDER BY "createdAt" DESC
        LIMIT 1
      )`),
          "DESC",
        ],
      ],
    });
  };

  getDialog = async (id: string, userId: string) => {
    // Проверка на участие в диалоге
    const dialog = await Dialog.findOne({
      where: { id },
      include: [
        {
          attributes: [],
          model: DialogMembers,
          where: {
            dialogId: id,
            userId,
          },
        },
      ],
    });

    if (!dialog) {
      return Promise.reject(new NotFoundException("Диалог не найден"));
    }

    return Dialog.findByPk(id, {
      subQuery: false,
      attributes: {
        include: [
          [fn("COUNT", col("dialogMessages.id")), "unreadMessagesCount"],
        ],
      },
      group: [
        "dialog.id",
        "owner.id",
        "owner->role.id",
        "owner->role->permissions.id",
      ],
      include: DialogService.include(userId),
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Диалог не найден"));
      }

      return result;
    });
  };

  findDialog = async (userId: string, recipientId: string[] = []) => {
    const userIds = Array.from(new Set(recipientId).add(userId));

    const dialogs = await Dialog.findAll({
      include: [
        {
          model: DialogMembers,
          attributes: [],
          where: {
            userId: {
              [Op.in]: userIds,
            },
          },
          required: true,
        },
      ],
      group: ["dialog.id"],
      having: where(fn("COUNT", fn("DISTINCT", col("members.userId"))), {
        [Op.gte]: userIds.length,
      }),
      raw: true,
    });

    return dialogs.map(item => item.id);
  };

  createDialog = async (userId: string, body: DialogCreateRequest) => {
    const users = (
      await Promise.all(
        body.recipientId.map(recipientId =>
          User.findByPk(recipientId).catch(() => null),
        ),
      )
    ).every(Boolean);

    if (!users) {
      return Promise.reject(new NotFoundException("Пользователь не найден"));
    }

    const dialog = await Dialog.create({
      ownerId: userId,
    });

    await this._dialogMembersService.addMembers({
      dialogId: dialog.id,
      members: Array.from(new Set(body.recipientId).add(userId)),
    });

    return this.getDialog(dialog.id, userId);
  };

  removeDialog = async (id: string) => {
    const dialog = await Dialog.findByPk(id);

    if (!dialog) {
      return Promise.reject(new NotFoundException("Диалог не найден"));
    }

    const members = await dialog.getMembers();

    members.forEach(({ userId }) => {
      const client = this._socketService.getClient(userId);

      if (client) {
        client.emit("deleteDialog", id);
      }
    });

    return dialog.destroy();
  };

  static include(userId: string): Includeable[] {
    return [
      // Подсчёт непрочитанных сообщений
      {
        model: DialogMessages,
        attributes: [],
        where: {
          received: false,
          userId: {
            [Op.not]: userId,
          },
        },
        required: false,
      },
      // Получаем последнее сообщение
      {
        model: DialogMessages,
        as: "lastMessage", // alias для последнего сообщения
        order: [["createdAt", "DESC"]],
        limit: 1, // Ограничиваем 1 сообщением
        include: DialogMessagesService.include,
      },
      // Подключение участников диалога
      {
        model: DialogMembers,
        required: true,
        separate: true,
        include: [
          {
            model: User,
            required: true,
            attributes: UserService.attributes,
            include: UserService.include,
          },
        ],
      },
      // Подключение владельца диалога
      {
        model: User,
        attributes: UserService.attributes,
        as: "owner",
        required: true,
        include: UserService.include,
      },
    ];
  }
}
