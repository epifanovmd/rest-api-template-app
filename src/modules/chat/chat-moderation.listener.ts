import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import {
  ChatMemberBannedEvent,
  ChatMemberUnbannedEvent,
  ChatSlowModeEvent,
} from "./events";

@Injectable()
export class ChatModerationListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(ChatSlowModeEvent, (event: ChatSlowModeEvent) => {
      this._emitter.toRoom(`chat_${event.chatId}`, "chat:slow-mode", {
        chatId: event.chatId,
        seconds: event.seconds,
      });
    });

    this._eventBus.on(
      ChatMemberBannedEvent,
      (event: ChatMemberBannedEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "chat:member:banned", {
          chatId: event.chatId,
          userId: event.targetUserId,
          bannedBy: event.bannedByUserId,
          reason: event.reason,
        });
      },
    );

    this._eventBus.on(
      ChatMemberUnbannedEvent,
      (event: ChatMemberUnbannedEvent) => {
        this._emitter.toRoom(`chat_${event.chatId}`, "chat:member:unbanned", {
          chatId: event.chatId,
          userId: event.targetUserId,
        });
      },
    );
  }
}
