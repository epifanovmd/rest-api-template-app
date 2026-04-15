import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
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
import { ISocketEventListener } from "../socket";
import { SyncService } from "./sync.service";
import { ESyncAction, ESyncEntityType } from "./sync.types";

/**
 * Правила scoping записей в sync_logs:
 *
 *   SCOPE:  scopeId=set,  userId=NULL  → видно всем с доступом к этому scope
 *   USER:   userId=set,   scopeId=NULL → видно только этому пользователю
 *
 * scopeId — generic. Для чатов это chatId. Для будущих сущностей —
 * их group identifier (folderId, teamId, и т.д.).
 *
 * ProfileUpdated НЕ логируется — обрабатывается socket events + API.
 */
@Injectable()
export class SyncListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SyncService) private readonly _syncService: SyncService,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
  ) {}

  register(): void {
    // ── Messages (scope = chatId) ────────────────────────────────

    this._eventBus.on(
      MessageCreatedEvent,
      (event: MessageCreatedEvent) => {
        this._logScopeScoped(
          event.chatId,
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.CREATE,
          MessageDto.fromEntity(event.message) as unknown as Record<
            string,
            unknown
          >,
          event.memberUserIds.filter(id => id !== event.message.senderId),
        );
      },
    );

    this._eventBus.on(
      MessageUpdatedEvent,
      (event: MessageUpdatedEvent) => {
        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.UPDATE,
          MessageDto.fromEntity(event.message) as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );

    this._eventBus.on(
      MessageDeletedEvent,
      (event: MessageDeletedEvent) => {
        if (!event.forAll) return;

        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.MESSAGE,
          event.messageId,
          ESyncAction.DELETE,
        );
      },
    );

    // ── Chats (scope = chatId) ───────────────────────────────────

    this._eventBus.on(ChatCreatedEvent, (event: ChatCreatedEvent) => {
      this._logScopeScoped(
        event.chat.id,
        ESyncEntityType.CHAT,
        event.chat.id,
        ESyncAction.CREATE,
        ChatDto.fromEntity(event.chat) as unknown as Record<string, unknown>,
        event.memberUserIds,
      );
    });

    this._eventBus.on(ChatUpdatedEvent, (event: ChatUpdatedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chat.id,
        ESyncEntityType.CHAT,
        event.chat.id,
        ESyncAction.UPDATE,
        ChatDto.fromEntity(event.chat) as unknown as Record<string, unknown>,
      );
    });

    // ── Chat Members (scope = chatId) ────────────────────────────

    this._eventBus.on(
      ChatMemberJoinedEvent,
      (event: ChatMemberJoinedEvent) => {
        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.CHAT_MEMBER,
          `${event.chatId}:${event.userId}`,
          ESyncAction.CREATE,
        );
      },
    );

    this._eventBus.on(
      ChatMemberLeftEvent,
      (event: ChatMemberLeftEvent) => {
        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.CHAT_MEMBER,
          `${event.chatId}:${event.userId}`,
          ESyncAction.DELETE,
        );
      },
    );

    // ── Contacts (user-scoped) ───────────────────────────────────

    this._eventBus.on(
      ContactRequestEvent,
      (event: ContactRequestEvent) => {
        this._logUserScoped(
          event.targetUserId,
          ESyncEntityType.CONTACT,
          event.contact.id,
          ESyncAction.CREATE,
          event.contact as unknown as Record<string, unknown>,
        );
      },
    );

    this._eventBus.on(
      ContactAcceptedEvent,
      (event: ContactAcceptedEvent) => {
        this._logUserScoped(
          event.requesterId,
          ESyncEntityType.CONTACT,
          event.contact.id,
          ESyncAction.UPDATE,
          event.contact as unknown as Record<string, unknown>,
        );
      },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Scope-scoped: scopeId=set, userId=NULL. Видно всем с доступом к scope. */
  private _logScopeScoped(
    scopeId: string,
    entityType: ESyncEntityType,
    entityId: string,
    action: ESyncAction,
    payload?: Record<string, unknown> | null,
    notifyUserIds?: string[],
  ): void {
    this._syncService
      .logChange(entityType, entityId, action, {
        scopeId,
        userId: null,
        payload: payload ?? null,
        notifyUserIds,
      })
      .catch(err => {
        logger.error(
          { err, entityType, entityId, action, scopeId },
          "[SyncListener] Failed to log scope-scoped change",
        );
      });
  }

  /** Scope-scoped с автоматическим lookup memberUserIds для push. */
  private _logScopeScopedWithMemberLookup(
    scopeId: string,
    entityType: ESyncEntityType,
    entityId: string,
    action: ESyncAction,
    payload?: Record<string, unknown> | null,
  ): void {
    this._memberRepo
      .getMemberUserIds(scopeId)
      .then(memberIds => {
        return this._syncService.logChange(entityType, entityId, action, {
          scopeId,
          userId: null,
          payload: payload ?? null,
          notifyUserIds: memberIds,
        });
      })
      .catch(err => {
        logger.error(
          { err, entityType, entityId, action, scopeId },
          "[SyncListener] Failed to log scope-scoped change with member lookup",
        );
      });
  }

  /** User-scoped: userId=set, scopeId=NULL. Видно только этому пользователю. */
  private _logUserScoped(
    userId: string,
    entityType: ESyncEntityType,
    entityId: string,
    action: ESyncAction,
    payload?: Record<string, unknown> | null,
  ): void {
    this._syncService
      .logChange(entityType, entityId, action, {
        userId,
        scopeId: null,
        payload: payload ?? null,
        notifyUserIds: [userId],
      })
      .catch(err => {
        logger.error(
          { err, entityType, entityId, action, userId },
          "[SyncListener] Failed to log user-scoped change",
        );
      });
  }
}
