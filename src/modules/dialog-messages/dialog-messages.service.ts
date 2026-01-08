import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { Not } from "typeorm";

import { Injectable } from "../../core";
import { DialogService } from "../dialog";
import {
  DialogMembersRepository,
  DialogMembersService,
} from "../dialog-members";
import { FcmTokenService } from "../fcm-token";
import { FileRepository } from "../file";
import { MessageFilesRepository } from "../message-files";
import { SocketService } from "../socket";
import { DialogMessagesRepository } from "./dialog-messages.repository";
import { DialogLastMessagesDto, DialogMessagesDto } from "./dto";

@Injectable()
export class DialogMessagesService {
  constructor(
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogService) private _dialogService: DialogService,
    @inject(FcmTokenService) private _fcmTokenService: FcmTokenService,
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(DialogMembersRepository)
    private _dialogMembersRepository: DialogMembersRepository,
    @inject(MessageFilesRepository)
    private _messageFilesRepository: MessageFilesRepository,
  ) {}

  async getAllMessages(dialogId: string, offset?: number, limit?: number) {
    const [messages, total] =
      await this._dialogMessagesRepository.findByDialogId(
        dialogId,
        offset,
        limit,
        {
          user: true,
          reply: true,
          // images: true,
          // videos: true,
          // audios: true,
        },
      );

    return messages.map(DialogMessagesDto.fromEntity);
  }

  async getLastMessage(dialogId: string) {
    const message = await this._dialogMessagesRepository.findLastByDialogId(
      dialogId,
    );

    return message ? [DialogLastMessagesDto.fromEntity(message)] : [];
  }

  async getMessageById(id: string, userId?: string) {
    const message = await this._dialogMessagesRepository.findById(id, {
      user: true,
      reply: true,
      messageFiles: true,
      // images: true,
      // videos: true,
      // audios: true,
    });

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (userId && message.userId !== userId) {
      throw new NotFoundException("Сообщение не найдено");
    }

    return DialogMessagesDto.fromEntity(message);
  }

  async appendMessage(userId: string, body: any) {
    const dialog = await this._dialogService.getDialog(body.dialogId, userId);

    const message = await this._dialogMessagesRepository.createAndSave({
      ...body,
      userId,
      sent: true,
    });

    const result = await this.getMessageById(message.id, userId);

    await this._dialogService.updateDialogLastMessage(
      body.dialogId,
      message.id,
    );

    const members = dialog.members.filter(member => member.userId !== userId);

    members.forEach(member => {
      this.sendSocketMessage(member.userId, result);
      this.sendPushNotification(member.userId, result);
    });

    // if (body.imageIds?.length) {
    //   const files = await this._fileRepository.findByIds(body.imageIds);
    //   // Здесь нужно будет добавить логику для связывания файлов с сообщением
    //   // через MessageFilesRepository
    // }
    //
    // if (body.videoIds?.length) {
    //   const files = await this._fileRepository.findByIds(body.videoIds);
    //   // Аналогично для видео
    // }
    //
    // if (body.audioIds?.length) {
    //   const files = await this._fileRepository.findByIds(body.audioIds);
    //   // Аналогично для аудио
    // }

    return result;
  }

  async updateMessage(id: string, userId: string, updateData: any) {
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

    const updatedMessage = { ...message, ...rest };

    await this._dialogMessagesRepository.update(id, updatedMessage);

    if (!updatedMessage) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const dialog = await this._dialogService.getDialog(
      updatedMessage.dialogId,
      userId,
    );

    dialog.members.forEach(member => {
      this.sendSocketMessage(member.userId, updatedMessage.toDTO());
    });

    return updatedMessage.toDTO();
  }

  async deleteMessage(id: string, userId: string): Promise<boolean> {
    const queryRunner = this._dialogMessagesRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const message = await this._dialogMessagesRepository.findById(id);

      if (!message) {
        throw new NotFoundException("Сообщение не найдено");
      }

      const dialog = await this._dialogService.getDialog(
        message.dialogId,
        userId,
      );

      if (dialog.lastMessageId === id) {
        const previousMessage = await this._dialogMessagesRepository.findOne({
          where: {
            dialogId: message.dialogId,
            id: Not(message.id),
          },
          order: {
            updatedAt: "DESC",
          },
        });

        if (previousMessage) {
          await this._dialogService.updateDialogLastMessage(
            message.dialogId,
            previousMessage.id,
          );
        }
      }

      const deleted = await this._dialogMessagesRepository
        .delete(id)
        .then(res => !!res.affected);

      await queryRunner.commitTransaction();

      const members = await this._dialogMembersService.getMembers(
        message.dialogId,
      );

      members.forEach(({ userId: memberId }) => {
        const client = this._socketService.getClient(memberId);

        if (client) {
          client.emit("deleteMessage", message.dialogId, id);
        }
      });

      return deleted;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  sendSocketMessage(recipientId: string, message: any) {
    const client = this._socketService.getClient(recipientId);

    return !!client?.emit("message", message);
  }

  async sendPushNotification(recipientId: string, message: any) {
    try {
      const fcmTokens = await this._fcmTokenService.getTokens(recipientId);
      const badge = await this._dialogService.getUnreadMessagesCount(
        recipientId,
      );

      for (const token of fcmTokens) {
        try {
          await this._fcmTokenService.sendFcmMessage({
            dialogId: message.dialogId,
            to: token.token,
            badge,
            message: {
              sound: "default",
              description: message.text,
              title: "message.user.email",
            },
          });
        } catch (error) {
          await this._fcmTokenService.deleteToken(token.id);
        }
      }
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }
}
