import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { DialogService } from "../dialog/dialog.service";
import { FcmTokenService } from "../fcm-token";
import { FileRepository } from "../file/file.repository";
import { MessageFilesRepository } from "../message-files/message-files.repository";
import { SocketService } from "../socket";
import { DialogMessagesRepository } from "./dialog-messages.repository";

@Injectable()
export class DialogMessagesService {
  constructor(
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogService) private _dialogService: DialogService,
    @inject(FcmTokenService) private _fcmTokenService: FcmTokenService,
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
    @inject(FileRepository) private _fileRepository: FileRepository,
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

    return messages.map(message => message.toDTO());
  }

  async getLastMessage(dialogId: string) {
    const message = await this._dialogMessagesRepository.findLastByDialogId(
      dialogId,
    );

    return message ? [message.toDTO()] : [];
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

    return message.toDTO();
  }

  async appendMessage(userId: string, body: any) {
    const dialog = await this._dialogService.getDialog(body.dialogId, userId);

    const message = await this._dialogMessagesRepository.create({
      ...body,
      userId,
      sent: true,
    });

    const result = await this.getMessageById(message.id, userId);

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

    const updatedMessage = await this._dialogMessagesRepository.update(
      id,
      rest,
    );

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

  async deleteMessage(id: string, userId: string) {
    const message = await this._dialogMessagesRepository.findById(id);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const dialog = await this._dialogService.getDialog(
      message.dialogId,
      userId,
    );

    dialog.members.forEach(({ userId: memberId }) => {
      if (this._socketService.getClient(memberId)) {
        const client = this._socketService.getClient(memberId);

        if (client) {
          client.emit("deleteMessage", dialog.id, id);
        }
      }
    });

    return this._dialogMessagesRepository.delete(id);
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
