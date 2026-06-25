import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
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
import { MessageService } from "./message.service";
import { MessageReceiptRepository } from "./message-receipt.repository";

@Injectable()
export class MessageListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(MessageService)
    private readonly _messageService: MessageService,
    @inject(MessageReceiptRepository)
    private readonly _receiptRepo: MessageReceiptRepository,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
  ) {}

  register(): void {
    this._eventBus.on(MessageCreatedEvent, (event: MessageCreatedEvent) => {
      const dto = MessageDto.fromEntity(event.message);

      // Прокидываем localId для дедупликации оптимистичных сообщений на клиенте
      if (event.localId) {
        dto.localId = event.localId;
      }

      // Broadcast new message to chat room
      this._emitter.toRoom(`chat_${event.chatId}`, "message:new", dto);

      // Отправить unread count каждому участнику (кроме отправителя).
      // unread_count уже заинкрементирован в sendMessage — читаем лёгким запросом (без JOIN).
      this._memberRepo
        .getMembersUnreadCounts(event.chatId)
        .then(members => {
          for (const member of members) {
            if (member.userId !== event.message.senderId) {
              this._emitter.toUser(member.userId, "chat:unread", {
                chatId: event.chatId,
                unreadCount: member.unreadCount,
              });
            }
          }
        })
        .catch(err => {
          logger.warn(
            { err, chatId: event.chatId },
            "[MessageListener] Failed to send unread counts on new message",
          );
        });
    });

    this._eventBus.on(MessageUpdatedEvent, (event: MessageUpdatedEvent) => {
      const dto = MessageDto.fromEntity(event.message);

      this._emitter.toRoom(`chat_${event.chatId}`, "message:updated", dto);
    });

    this._eventBus.on(MessageDeletedEvent, (event: MessageDeletedEvent) => {
      const payload = {
        messageId: event.messageId,
        chatId: event.chatId,
        forAll: event.forAll,
      };

      if (event.forAll) {
        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "message:deleted",
          payload,
        );
      } else {
        this._emitter.toUser(event.userId, "message:deleted", payload);
      }
    });

    this._eventBus.on(MessagePinnedEvent, (event: MessagePinnedEvent) => {
      const dto = MessageDto.fromEntity(event.message);

      this._emitter.toRoom(`chat_${event.chatId}`, "message:pinned", dto);
    });

    this._eventBus.on(MessageUnpinnedEvent, (event: MessageUnpinnedEvent) => {
      this._emitter.toRoom(`chat_${event.chatId}`, "message:unpinned", {
        messageId: event.messageId,
        chatId: event.chatId,
      });
    });

    this._eventBus.on(MessageReactionEvent, (event: MessageReactionEvent) => {
      this._emitter.toRoom(`chat_${event.chatId}`, "message:reaction", {
        messageId: event.messageId,
        chatId: event.chatId,
        userId: event.userId,
        emoji: event.emoji,
      });
    });

    this._eventBus.on(MessageDeliveredEvent, (event: MessageDeliveredEvent) => {
      this._emitStatusWithReceipts(
        event.chatId,
        event.userId,
        event.messageIds,
        "delivered",
      );
    });

    this._eventBus.on(MessageReadEvent, (event: MessageReadEvent) => {
      // Отправить обновлённый unread count читателю.
      // unread_count уже сброшен в markAsRead — читаем из membership.
      this._memberRepo
        .findMembership(event.chatId, event.userId)
        .then(membership => {
          this._emitter.toUser(event.userId, "chat:unread", {
            chatId: event.chatId,
            unreadCount: membership?.unreadCount ?? 0,
          });
        })
        .catch(err => {
          logger.warn(
            { err, chatId: event.chatId, userId: event.userId },
            "[MessageListener] Failed to send unread count on read",
          );
        });

      // Notify the chat room with per-user status and receipt summary
      this._emitStatusWithReceipts(
        event.chatId,
        event.userId,
        event.messageIds,
        "read",
      );
    });
  }

  /**
   * Emit message:status с receipt summary для каждого messageId.
   * Загружает summary batch-запросом, затем шлёт по одному событию.
   */
  private _emitStatusWithReceipts(
    chatId: string,
    userId: string,
    messageIds: string[],
    status: string,
  ): void {
    // Загружаем все summary параллельно
    const summaryPromises = messageIds.map(id =>
      this._receiptRepo.getReceiptSummary(id).catch(err => {
        logger.warn(
          { err, messageId: id, chatId },
          "[MessageListener] Failed to get receipt summary",
        );

        return null;
      }),
    );

    Promise.all(summaryPromises)
      .then(summaries => {
        for (let i = 0; i < messageIds.length; i += 1) {
          const payload: {
            messageId: string;
            chatId: string;
            status: string;
            userId: string;
            receiptSummary?: { delivered: number; read: number; total: number };
          } = {
            messageId: messageIds[i],
            chatId,
            status,
            userId,
          };

          if (summaries[i]) {
            payload.receiptSummary = summaries[i] ?? undefined;
          }

          this._emitter.toRoom(`chat_${chatId}`, "message:status", payload);
        }
      })
      .catch(err => {
        logger.error(
          { err, chatId, userId, status, count: messageIds.length },
          "[MessageListener] Failed to emit status with receipts",
        );
      });
  }
}
