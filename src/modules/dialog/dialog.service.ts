import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { IDataSource, Injectable } from "../../core";
import { DialogMembersService } from "../dialog-members";
import { DialogMembersRepository } from "../dialog-members/dialog-members.repository";
import { DialogMessagesRepository } from "../dialog-messages/dialog-messages.repository";
import { SocketService } from "../socket";
import { UserRepository } from "../user/user.repository";
import { DialogCreateRequest } from "./dialog.dto";
import { DialogRepository } from "./dialog.repository";

@Injectable()
export class DialogService {
  constructor(
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogRepository) private _dialogRepository: DialogRepository,
    @inject(DialogMembersRepository)
    private _dialogMembersRepository: DialogMembersRepository,
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
    @inject(UserRepository) private _userRepository: UserRepository,
    @IDataSource() private _dataSource: IDataSource,
  ) {}

  async getUnreadMessagesCount(
    userId: string,
    dialogId?: string,
  ): Promise<number> {
    return this._dialogMessagesRepository.countUnreadMessages(userId, dialogId);
  }

  async getDialogs(userId: string, offset?: number, limit?: number) {
    // Получаем ID диалогов пользователя
    const userDialogs = await this._dialogMembersRepository.findByUserId(
      userId,
    );
    const dialogIds = userDialogs.map(member => member.dialogId);

    if (dialogIds.length === 0) {
      return [];
    }

    // Используем QueryBuilder для сложного запроса
    const queryBuilder = this._dataSource
      .getRepository("Dialog")
      .createQueryBuilder("dialog")
      .leftJoinAndSelect("dialog.owner", "owner")
      .leftJoinAndSelect("owner.role", "ownerRole")
      .leftJoinAndSelect("ownerRole.permissions", "ownerPermissions")
      .leftJoin("dialog.members", "members")
      .leftJoinAndSelect("members.user", "memberUser")
      .leftJoinAndSelect("memberUser.role", "memberUserRole")
      .leftJoinAndSelect("memberUserRole.permissions", "memberUserPermissions")
      .leftJoin("dialog.messages", "messages")
      .leftJoinAndMapOne(
        "dialog.lastMessage",
        "dialog.messages",
        "lastMessage",
        "lastMessage.id = (SELECT id FROM dialog_messages WHERE dialog_id = dialog.id ORDER BY created_at DESC LIMIT 1)",
      )
      .leftJoinAndSelect("lastMessage.user", "lastMessageUser")
      .leftJoinAndSelect("lastMessageUser.role", "lastMessageUserRole")
      .addSelect(subQuery => {
        return subQuery
          .select("COUNT(unreadMessages.id)", "unreadCount")
          .from("dialog_messages", "unreadMessages")
          .where("unreadMessages.dialog_id = dialog.id")
          .andWhere("unreadMessages.received = false")
          .andWhere("unreadMessages.user_id != :userId", { userId });
      }, "dialog_unreadMessagesCount")
      .where("dialog.id IN (:...dialogIds)", { dialogIds })
      .orderBy("lastMessage.createdAt", "DESC")
      .addOrderBy("dialog.createdAt", "DESC")
      .groupBy("dialog.id")
      .addGroupBy("owner.id")
      .addGroupBy("ownerRole.id")
      .addGroupBy("members.id")
      .addGroupBy("memberUser.id")
      .addGroupBy("memberUserRole.id")
      .addGroupBy("lastMessage.id")
      .addGroupBy("lastMessageUser.id")
      .addGroupBy("lastMessageUserRole.id");

    if (limit !== undefined) {
      queryBuilder.limit(limit);
    }

    if (offset !== undefined) {
      queryBuilder.offset(offset);
    }

    const dialogs = await queryBuilder.getMany();

    // Преобразуем результаты в DTO
    return dialogs.map(dialog => {
      const dto = dialog.toDTO();

      // Получаем количество непрочитанных сообщений
      const unreadCount =
        dialogs.find(d => d.id === dialog.id)?.["unreadMessagesCount"] || 0;

      dto.unreadMessagesCount = parseInt(unreadCount, 10) || 0;

      return dto;
    });
  }

  async getDialog(id: string, userId: string) {
    // Проверяем участие пользователя в диалоге
    const member = await this._dialogMembersRepository.findByUserIdAndDialogId(
      userId,
      id,
    );

    if (!member) {
      throw new NotFoundException("Диалог не найден");
    }

    const queryBuilder = this._dataSource
      .getRepository("Dialog")
      .createQueryBuilder("dialog")
      .leftJoinAndSelect("dialog.owner", "owner")
      .leftJoinAndSelect("owner.role", "ownerRole")
      .leftJoinAndSelect("ownerRole.permissions", "ownerPermissions")
      .leftJoinAndSelect("dialog.members", "members")
      .leftJoinAndSelect("members.user", "memberUser")
      .leftJoinAndSelect("memberUser.role", "memberUserRole")
      .leftJoinAndSelect("memberUserRole.permissions", "memberUserPermissions")
      .leftJoin("dialog.messages", "messages")
      .leftJoinAndMapOne(
        "dialog.lastMessage",
        "dialog.messages",
        "lastMessage",
        "lastMessage.id = (SELECT id FROM dialog_messages WHERE dialog_id = dialog.id ORDER BY created_at DESC LIMIT 1)",
      )
      .leftJoinAndSelect("lastMessage.user", "lastMessageUser")
      .leftJoinAndSelect("lastMessageUser.role", "lastMessageUserRole")
      .addSelect(subQuery => {
        return subQuery
          .select("COUNT(unreadMessages.id)", "unreadCount")
          .from("dialog_messages", "unreadMessages")
          .where("unreadMessages.dialog_id = dialog.id")
          .andWhere("unreadMessages.received = false")
          .andWhere("unreadMessages.user_id != :userId", { userId });
      }, "dialog_unreadMessagesCount")
      .where("dialog.id = :id", { id })
      .groupBy("dialog.id")
      .addGroupBy("owner.id")
      .addGroupBy("ownerRole.id")
      .addGroupBy("members.id")
      .addGroupBy("memberUser.id")
      .addGroupBy("memberUserRole.id")
      .addGroupBy("lastMessage.id")
      .addGroupBy("lastMessageUser.id")
      .addGroupBy("lastMessageUserRole.id");

    const dialog = await queryBuilder.getOne();

    if (!dialog) {
      throw new NotFoundException("Диалог не найден");
    }

    const dto = dialog.toDTO();
    const unreadCount = dialog["unreadMessagesCount"] || 0;

    dto.unreadMessagesCount = parseInt(unreadCount, 10) || 0;

    return dto;
  }

  async findDialog(userId: string, recipientIds: string[] = []) {
    const userIds = Array.from(new Set([userId, ...recipientIds]));

    if (userIds.length < 2) {
      return [];
    }

    const queryBuilder = this._dataSource
      .createQueryBuilder()
      .select("dialog.id", "id")
      .from("Dialog", "dialog")
      .innerJoin("dialog.members", "members")
      .where("members.userId IN (:...userIds)", { userIds })
      .groupBy("dialog.id")
      .having("COUNT(DISTINCT members.userId) = :userCount", {
        userCount: userIds.length,
      });

    const result = await queryBuilder.getRawMany();

    return result.map(row => row.id);
  }

  async createDialog(userId: string, body: DialogCreateRequest) {
    const queryRunner = this._dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Проверяем существование пользователей
      const users = await Promise.all(
        body.recipientId.map(recipientId =>
          this._userRepository.findById(recipientId),
        ),
      );

      const allUsersExist = users.every(user => user !== null);

      if (!allUsersExist) {
        throw new NotFoundException(
          "Один или несколько пользователей не найдены",
        );
      }

      // Создаем диалог
      const dialog = await this._dialogRepository.create({
        ownerId: userId,
      });

      // Добавляем участников
      const members = Array.from(new Set([userId, ...body.recipientId]));

      await this._dialogMembersService.addMembers({
        dialogId: dialog.id,
        members,
      });

      await queryRunner.commitTransaction();

      // Получаем полный объект диалога
      return this.getDialog(dialog.id, userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async removeDialog(id: string) {
    const queryRunner = this._dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const dialog = await this._dialogRepository.findById(id, {
        members: true,
      });

      if (!dialog) {
        throw new NotFoundException("Диалог не найден");
      }

      // Уведомляем участников
      dialog.members.forEach(member => {
        const client = this._socketService.getClient(member.userId);

        if (client) {
          client.emit("deleteDialog", id);
        }
      });

      // Удаляем диалог
      const deleted = await this._dialogRepository.delete(id);

      if (!deleted) {
        throw new NotFoundException("Не удалось удалить диалог");
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateDialogLastMessage(dialogId: string, messageId: string) {
    await this._dataSource
      .createQueryBuilder()
      .update("Dialog")
      .set({ lastMessageId: messageId })
      .where("id = :dialogId", { dialogId })
      .execute();

    return true;
  }
}
