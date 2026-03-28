import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatDto } from "../chat/dto";
import {
  ChatCreatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatUpdatedEvent,
} from "../chat/events";
import { ContactAcceptedEvent, ContactRequestEvent } from "../contact/events";
import { MessageDto } from "../message/dto/message.dto";
import {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageUpdatedEvent,
} from "../message/events";
import { ProfileUpdatedEvent } from "../profile/events/profile-updated.event";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { SyncService } from "./sync.service";
import { ESyncAction, ESyncEntityType } from "./sync.types";

@Injectable()
export class SyncListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SyncService) private readonly _syncService: SyncService,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    // ── Messages ──────────────────────────────────────────────────

    this._eventBus.on(
      MessageCreatedEvent,
      async (event: MessageCreatedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.CREATE,
          {
            chatId: event.chatId,
            payload: MessageDto.fromEntity(event.message) as unknown as Record<string, unknown>,
          },
        );
        this._notifyUsers(event.memberUserIds);
      },
    );

    this._eventBus.on(
      MessageUpdatedEvent,
      async (event: MessageUpdatedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.UPDATE,
          {
            chatId: event.chatId,
            payload: MessageDto.fromEntity(event.message) as unknown as Record<string, unknown>,
          },
        );
      },
    );

    this._eventBus.on(
      MessageDeletedEvent,
      async (event: MessageDeletedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.MESSAGE,
          event.messageId,
          ESyncAction.DELETE,
          { chatId: event.chatId },
        );
      },
    );

    // ── Chats ─────────────────────────────────────────────────────

    this._eventBus.on(
      ChatCreatedEvent,
      async (event: ChatCreatedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CHAT,
          event.chat.id,
          ESyncAction.CREATE,
          {
            chatId: event.chat.id,
            payload: ChatDto.fromEntity(event.chat) as unknown as Record<string, unknown>,
          },
        );
        this._notifyUsers(event.memberUserIds);
      },
    );

    this._eventBus.on(
      ChatUpdatedEvent,
      async (event: ChatUpdatedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CHAT,
          event.chat.id,
          ESyncAction.UPDATE,
          {
            chatId: event.chat.id,
            payload: ChatDto.fromEntity(event.chat) as unknown as Record<string, unknown>,
          },
        );
      },
    );

    // ── Chat Members ──────────────────────────────────────────────

    this._eventBus.on(
      ChatMemberJoinedEvent,
      async (event: ChatMemberJoinedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CHAT_MEMBER,
          event.userId,
          ESyncAction.CREATE,
          { chatId: event.chatId, userId: event.userId },
        );
      },
    );

    this._eventBus.on(
      ChatMemberLeftEvent,
      async (event: ChatMemberLeftEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CHAT_MEMBER,
          event.userId,
          ESyncAction.DELETE,
          { chatId: event.chatId, userId: event.userId },
        );
      },
    );

    // ── Contacts ──────────────────────────────────────────────────

    this._eventBus.on(
      ContactRequestEvent,
      async (event: ContactRequestEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CONTACT,
          event.contact.id,
          ESyncAction.CREATE,
          {
            userId: event.targetUserId,
            payload: event.contact as unknown as Record<string, unknown>,
          },
        );
        this._notifyUsers([event.targetUserId]);
      },
    );

    this._eventBus.on(
      ContactAcceptedEvent,
      async (event: ContactAcceptedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.CONTACT,
          event.contact.id,
          ESyncAction.UPDATE,
          {
            userId: event.requesterId,
            payload: event.contact as unknown as Record<string, unknown>,
          },
        );
        this._notifyUsers([event.requesterId]);
      },
    );

    // ── Profile ───────────────────────────────────────────────────

    this._eventBus.on(
      ProfileUpdatedEvent,
      async (event: ProfileUpdatedEvent) => {
        await this._syncService.logChange(
          ESyncEntityType.PROFILE,
          event.profile.id,
          ESyncAction.UPDATE,
          { payload: event.profile as unknown as Record<string, unknown> },
        );
      },
    );
  }

  private _notifyUsers(userIds: string[]) {
    for (const userId of userIds) {
      this._emitter.toUser(userId, "sync:available", { version: "0" });
    }
  }
}
