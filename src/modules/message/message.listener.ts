import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { MessageDto } from "./dto";
import {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageDeliveredEvent,
  MessagePinnedEvent,
  MessageReactionEvent,
  MessageReadEvent,
  MessageUnpinnedEvent,
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

    this._eventBus.on(
      MessagePinnedEvent,
      (event: MessagePinnedEvent) => {
        const dto = MessageDto.fromEntity(event.message);

        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "message:pinned",
          dto,
        );
      },
    );

    this._eventBus.on(
      MessageUnpinnedEvent,
      (event: MessageUnpinnedEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "message:unpinned", {
          messageId: event.messageId,
          chatId: event.chatId,
        });
      },
    );

    this._eventBus.on(
      MessageReactionEvent,
      (event: MessageReactionEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "message:reaction", {
          messageId: event.messageId,
          chatId: event.chatId,
          userId: event.userId,
          emoji: event.emoji,
        });
      },
    );

    this._eventBus.on(
      MessageDeliveredEvent,
      (event: MessageDeliveredEvent) => {
        for (const messageId of event.messageIds) {
          this._emitter.toRoom(`chat_${event.chatId}`, "message:status", {
            messageId,
            chatId: event.chatId,
            status: "delivered",
          });
        }
      },
    );

    this._eventBus.on(MessageReadEvent, (event: MessageReadEvent) => {
      this._emitter.toUser(event.userId, "chat:unread", {
        chatId: event.chatId,
        unreadCount: 0, // Сигнал о прочтении — только для пользователя, прочитавшего сообщение
      });
    });

  }
}
