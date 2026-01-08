import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import { DialogMessagesRepository } from "./dialog-messages.repository";
import { DialogLastMessagesDto, DialogMessagesDto } from "./dto";

@Injectable()
export class DialogMessagesService {
  constructor(
    @inject(DialogMessagesRepository)
    private _dialogMessagesRepository: DialogMessagesRepository,
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

  updateReceived(messageIds: string[]) {
    return this._dialogMessagesRepository.update(
      { id: In(messageIds) },
      { received: true },
    );
  }
}
