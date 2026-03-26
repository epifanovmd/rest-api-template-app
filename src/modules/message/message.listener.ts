import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { MessageDto } from "./dto";
import {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageReadEvent,
  MessageUpdatedEvent,
} from "./events";

@Injectable()
export class MessageListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(
      MessageCreatedEvent,
      (event: MessageCreatedEvent) => {
        const dto = MessageDto.fromEntity(event.message);

        // Отправляем в комнату чата
        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "message:new",
          dto,
        );

        // Уведомляем всех участников об обновлении непрочитанных
        for (const userId of event.memberUserIds) {
          if (userId !== event.message.senderId) {
            this._emitter.toUser(userId, "chat:unread", {
              chatId: event.chatId,
              unreadCount: -1, // Сигнал клиенту пересчитать
            });
          }
        }
      },
    );

    this._eventBus.on(
      MessageUpdatedEvent,
      (event: MessageUpdatedEvent) => {
        const dto = MessageDto.fromEntity(event.message);

        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "message:updated",
          dto,
        );
      },
    );

    this._eventBus.on(
      MessageDeletedEvent,
      (event: MessageDeletedEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "message:deleted", {
          messageId: event.messageId,
          chatId: event.chatId,
        });
      },
    );

    this._eventBus.on(MessageReadEvent, (event: MessageReadEvent) => {
      this._emitter.toRoom(`chat_${event.chatId}`, "chat:unread", {
        chatId: event.chatId,
        unreadCount: 0, // Сигнал о прочтении
      });
    });
  }
}
