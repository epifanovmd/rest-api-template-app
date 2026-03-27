import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { ChatDto, ChatLastMessageDto } from "./dto";
import {
  ChatArchivedEvent,
  ChatCreatedEvent,
  ChatLastMessageUpdatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatMemberRoleChangedEvent,
  ChatPinnedEvent,
  ChatUpdatedEvent,
} from "./events";

@Injectable()
export class ChatListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(ChatCreatedEvent, (event: ChatCreatedEvent) => {
      const dto = ChatDto.fromEntity(event.chat);

      for (const userId of event.memberUserIds) {
        this._emitter.toUser(userId, "chat:created", dto);
      }
    });

    this._eventBus.on(ChatUpdatedEvent, (event: ChatUpdatedEvent) => {
      const dto = ChatDto.fromEntity(event.chat);

      this._emitter.toRoom(`chat_${event.chat.id}`, "chat:updated", dto);
    });

    this._eventBus.on(
      ChatMemberJoinedEvent,
      (event: ChatMemberJoinedEvent) => {
        for (const userId of event.memberUserIds) {
          this._emitter.toUser(userId, "chat:member:joined", {
            chatId: event.chatId,
            userId: event.userId,
          });
        }
      },
    );

    this._eventBus.on(ChatMemberLeftEvent, (event: ChatMemberLeftEvent) => {
      for (const userId of event.memberUserIds) {
        this._emitter.toUser(userId, "chat:member:left", {
          chatId: event.chatId,
          userId: event.userId,
        });
      }
    });

    this._eventBus.on(ChatPinnedEvent, (event: ChatPinnedEvent) => {
      this._emitter.toUser(event.userId, "chat:pinned", {
        chatId: event.chatId,
        isPinned: event.isPinned,
      });
    });

    this._eventBus.on(ChatArchivedEvent, (event: ChatArchivedEvent) => {
      this._emitter.toUser(event.userId, "chat:archived", {
        chatId: event.chatId,
        isArchived: event.isArchived,
      });
    });

    this._eventBus.on(
      ChatMemberRoleChangedEvent,
      (event: ChatMemberRoleChangedEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "chat:member:role-changed", {
          chatId: event.chatId,
          userId: event.userId,
          role: event.role,
        });
      },
    );

    this._eventBus.on(
      ChatLastMessageUpdatedEvent,
      (event: ChatLastMessageUpdatedEvent) => {
        const lastMessage = ChatLastMessageDto.fromEntity(event.chat);

        for (const userId of event.memberUserIds) {
          this._emitter.toUser(userId, "chat:last-message", {
            chatId: event.chat.id,
            lastMessage,
          });
        }
      },
    );
  }
}
