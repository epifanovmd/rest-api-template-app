import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { Not } from "typeorm";

import { Injectable } from "../../core";
import { DialogMembersService } from "../dialog-members";
import { DialogMessagesRepository } from "../dialog-messages";
import { SocketService } from "../socket";
import { UserRepository } from "../user";
import { DialogRepository } from "./dialog.repository";
import { IDialogFindOrCreateResponseDto, IDialogFindResponseDto } from "./dto";

@Injectable()
export class DialogService {
  constructor(
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogRepository) private _dialogRepository: DialogRepository,
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
    @inject(UserRepository) private _userRepository: UserRepository,
  ) {}

  async getUnreadMessagesCount(
    userId: string,
    dialogId?: string,
  ): Promise<number> {
    return this._dialogMessagesRepository.countUnreadMessages(userId, dialogId);
  }

  async getDialogs(userId: string, offset?: number, limit?: number) {
    // Все в одном запросе
    const result = await this._dialogRepository
      .createQueryBuilder("dialog")
      .innerJoin("dialog.members", "member", "member.userId = :userId", {
        userId,
      })
      .leftJoinAndSelect("dialog.members", "members")
      .leftJoinAndSelect("members.user", "memberUser")
      .leftJoinAndSelect("memberUser.profile", "memberUserProfile")
      .leftJoinAndSelect("dialog.lastMessage", "lastMessage")
      // Непрочитанные сообщения
      .addSelect(
        qb =>
          qb
            .select("COUNT(*)")
            .from("DialogMessages", "msg")
            .where("msg.dialogId = dialog.id")
            .andWhere("msg.received = false")
            .andWhere("msg.userId != :userId"),
        "unreadCount",
      )
      .orderBy("dialog.updatedAt", "DESC")
      .offset(offset || 0)
      .limit(limit || 20)
      .getRawAndEntities();

    const dialogs = result.entities;

    if (dialogs.length === 0) {
      return [];
    }

    return dialogs.map((dialog, index) => {
      return {
        ...dialog,
        unreadMessagesCount: parseInt(result.raw[index]?.unreadCount || "0"),
      };
    });
  }

  async getDialog(id: string, userId: string) {
    const [dialog, unreadMessagesCount] = await Promise.all([
      this._dialogRepository.findOne({
        where: {
          id,
          // members: {
          //   userId: Not(userId),
          // },
        },
        relations: {
          owner: {
            profile: true,
          },
          members: {
            user: true,
          },
          lastMessage: true,
        },
        select: {
          lastMessage: {
            id: true,
            text: true,
            received: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      }),
      this._dialogMessagesRepository.count({
        where: {
          dialogId: id,
          received: false,
          userId: Not(userId),
        },
      }),
    ]);

    if (!dialog) {
      throw new NotFoundException("Диалог не найден");
    }

    return {
      ...dialog,
      unreadMessagesCount,
    };
  }

  async getPrivateDialogWithUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<IDialogFindResponseDto> {
    const dialogId = await this._dialogRepository.findPrivateDialogBetweenUsers(
      currentUserId,
      targetUserId,
    );

    return { dialogId };
  }

  async findDialog(
    userId: string,
    recipientIds: string[] = [],
  ): Promise<IDialogFindResponseDto> {
    const result = await this._dialogRepository.findDialogWithExactMembers([
      userId,
      ...recipientIds,
    ]);

    return {
      dialogId: result,
    };
  }

  async findOrCreate(
    userId: string,
    recipientId: string[] = [],
  ): Promise<IDialogFindOrCreateResponseDto> {
    const result = await this.findDialog(userId, recipientId);

    if (!result.dialogId) {
      return this.createDialog(userId, recipientId).then(res => ({
        dialogId: res.id,
      }));
    }

    return { dialogId: result.dialogId };
  }

  async createDialog(userId: string, recipientId: string[]) {
    const queryRunner = this._dialogRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Проверяем существование пользователей
      const users = await Promise.all(
        recipientId.map(recipientId =>
          this._userRepository.findOne({
            where: { id: recipientId },
          }),
        ),
      );

      const allUsersExist = users.every(user => user !== null);

      if (!allUsersExist) {
        throw new NotFoundException(
          "Один или несколько пользователей не найдены",
        );
      }

      // Создаем диалог
      const dialog = await this._dialogRepository.createAndSave({
        ownerId: userId,
      });

      // Добавляем участников
      const members = Array.from(new Set([userId, ...recipientId]));

      members.forEach(member => {
        const client = this._socketService.getClient(member);

        if (client) {
          client.emit("newDialog", member);
        }
      });

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
    const queryRunner = this._dialogRepository.createQueryRunner();

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

  async updateDialogLastMessage(
    dialogId: string,
    messageId: string,
  ): Promise<boolean> {
    const result = await this._dialogRepository.update(
      { id: dialogId },
      { lastMessageId: messageId },
    );

    return !!result.affected;
  }
}
