import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { ChatDto } from "./dto";
import {
  ChatCreatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
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
  }
}
