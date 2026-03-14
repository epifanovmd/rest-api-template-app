import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { Not } from "typeorm";

import { EventBus, Injectable } from "../../core";
import {
  DialogMembersRepository,
  DialogMembersService,
} from "../dialog-members";
import { DialogMessagesRepository } from "../dialog-messages";
import { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import {
  DialogMessagesDto,
  IMessagesUpdateRequestDto,
} from "../dialog-messages/dto";
import { MessageFilesRepository } from "../message-files";
import { UserRepository } from "../user";
import { DialogRepository } from "./dialog.repository";
import { IDialogFindOrCreateResponseDto, IDialogFindResponseDto } from "./dto";
import {
  DialogCreatedEvent,
  DialogDeletedEvent,
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageUpdatedEvent,
} from "./events";

@Injectable()
export class DialogService {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(DialogRepository) private _dialogRepository: DialogRepository,
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
    @inject(UserRepository) private _userRepository: UserRepository,
    @inject(DialogMembersRepository)
    private _dialogMembersRepository: DialogMembersRepository,
    @inject(MessageFilesRepository)
    private _messageFilesRepository: MessageFilesRepository,
  ) {}

  async getUnreadMessagesCount(
    userId: string,
    dialogId?: string,
  ): Promise<number> {
    return this._dialogMessagesRepository.countUnreadMessages(userId, dialogId);
  }

  async getDialogs(userId: string, offset?: number, limit?: number) {
    const result = await this._dialogRepository
      .createQueryBuilder("dialog")
      .innerJoin("dialog.members", "member", "member.userId = :userId", {
        userId,
      })
      .leftJoinAndSelect(
        "dialog.members",
        "members",
        "members.userId != :userId",
        { userId },
      )
      .leftJoinAndSelect("members.user", "memberUser")
      .leftJoinAndSelect("memberUser.profile", "memberUserProfile")
      .leftJoinAndSelect("dialog.lastMessage", "lastMessage")
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

    return dialogs.map((dialog, index) => ({
      ...dialog,
      unreadMessagesCount: parseInt(result.raw[index]?.unreadCount || "0"),
    }));
  }

  async getDialog(id: string, userId: string) {
    const [dialog, unreadMessagesCount] = await Promise.all([
      this._dialogRepository.findOne({
        where: {
          id,
          members: {
            userId: Not(userId),
          },
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
    const users = await Promise.all(
      recipientId.map(id => this._userRepository.findOne({ where: { id } })),
    );

    if (!users.every(user => user !== null)) {
      throw new NotFoundException(
        "Один или несколько пользователей не найдены",
      );
    }

    const dialog = await this._dialogRepository.createAndSave({
      ownerId: userId,
    });

    const members = Array.from(new Set([userId, ...recipientId]));

    await this._dialogMembersService.addMembers({
      dialogId: dialog.id,
      members,
    });

    this.eventBus.emit(new DialogCreatedEvent(dialog.id, members));

    return this.getDialog(dialog.id, userId);
  }

  async removeDialog(id: string) {
    const dialog = await this._dialogRepository.findById(id, { members: true });

    if (!dialog) {
      throw new NotFoundException("Диалог не найден");
    }

    const memberIds = dialog.members.map(m => m.userId);
    const deleted = await this._dialogRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException("Не удалось удалить диалог");
    }

    this.eventBus.emit(new DialogDeletedEvent(id, memberIds));
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

  async appendMessage(userId: string, body: any) {
    const dialog = await this.getDialog(body.dialogId, userId);

    const { id } = await this._dialogMessagesRepository.createAndSave({
      ...body,
      userId,
      sent: true,
    });

    const message = await this._dialogMessagesRepository.findById(id, {
      user: true,
      reply: true,
    });

    if (message) {
      await this.updateDialogLastMessage(body.dialogId, message.id);

      const recipientIds = dialog.members
        .filter(member => member.userId !== userId)
        .map(member => member.userId);

      const dto = DialogMessagesDto.fromEntity(message);

      this.eventBus.emit(new MessageCreatedEvent(dto, recipientIds));
    }

    return message;
  }

  async updateMessage(
    id: string,
    userId: string,
    updateData: IMessagesUpdateRequestDto,
  ) {
    const message = await this._dialogMessagesRepository.findById(id);

    if (!message || message.userId !== userId) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const { deleteFileIds, ...rest } = updateData;

    if (deleteFileIds && deleteFileIds.length > 0) {
      await this._messageFilesRepository.deleteByMessageIdAndFileIds(
        id,
        deleteFileIds,
      );
    }

    const updatedMessage: DialogMessages = { ...message, ...rest };

    await this._dialogMessagesRepository.update(id, updatedMessage);

    if (!updatedMessage) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const dialog = await this.getDialog(updatedMessage.dialogId, userId);
    const memberIds = dialog.members.map(m => m.userId);

    this.eventBus.emit(
      new MessageUpdatedEvent(
        DialogMessagesDto.fromEntity(updatedMessage),
        memberIds,
      ),
    );

    return updatedMessage;
  }

  async deleteMessage(id: string, userId: string): Promise<boolean> {
    const message = await this._dialogMessagesRepository.findOne({
      where: { id },
      select: ["id", "userId", "dialogId"],
    });

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (message.userId !== userId) {
      const isMember = await this._dialogMembersRepository.findOne({
        where: { userId, dialogId: message.dialogId },
        select: ["id"],
      });

      if (!isMember) {
        throw new ForbiddenException("Нет прав на удаление сообщения");
      }
    }

    return this._dialogMessagesRepository
      .withTransaction(async (repository, manager) => {
        const messageWithDialog = await repository.findOne({
          where: { id },
          relations: { dialog: true },
        });

        if (!messageWithDialog) {
          throw new NotFoundException("Сообщение не найдено");
        }

        const { dialogId, dialog } = messageWithDialog;

        if (dialog.lastMessageId === id) {
          const previousMessage = await repository.findOne({
            where: { dialogId, id: Not(id) },
            order: { createdAt: "DESC" },
            select: ["id"],
          });

          await this._dialogRepository
            .getRepository(manager)
            .update(
              { id: dialogId },
              { lastMessageId: previousMessage ? previousMessage.id : null },
            );
        }

        const deleteResult = await repository.delete({ id });

        if (deleteResult.affected === 0) {
          throw new NotFoundException("Не удалось удалить сообщение");
        }

        return !!deleteResult.affected;
      })
      .then(async result => {
        const members = await this._dialogMembersService.getMembers(
          message.dialogId,
        );

        this.eventBus.emit(
          new MessageDeletedEvent(
            message.dialogId,
            id,
            members.map(m => m.userId),
          ),
        );

        return result;
      });
  }
}
