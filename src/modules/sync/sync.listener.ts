import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { Chat, ChatMemberRepository } from "../chat";
import { ChatDto, collectChatFiles } from "../chat/dto";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatFolderChangedEvent,
  ChatMemberBannedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatMemberRoleChangedEvent,
  ChatMovedToFolderEvent,
  ChatMutedEvent,
  ChatPinnedEvent,
  ChatUpdatedEvent,
  TChatFolderChange,
} from "../chat/events";
import { ContactAcceptedEvent, ContactRequestEvent } from "../contact/events";
import { FileUrlService } from "../file";
import { collectMessageFiles, MessageDto } from "../message/dto/message.dto";
import {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessagePinnedEvent,
  MessageUnpinnedEvent,
  MessageUpdatedEvent,
} from "../message/events";
import { Message } from "../message/message.entity";
import {
  PollClosedEvent,
  PollCreatedEvent,
  PollVotedEvent,
} from "../poll/events";
import { ISocketEventListener } from "../socket";
import { SyncService } from "./sync.service";
import { ESyncAction, ESyncEntityType } from "./sync.types";

const FOLDER_CHANGE_ACTION: Record<TChatFolderChange, ESyncAction> = {
  created: ESyncAction.CREATE,
  updated: ESyncAction.UPDATE,
  deleted: ESyncAction.DELETE,
};

/**
 * Правила scoping записей в sync_logs:
 *
 *   SCOPE:  scopeId=set,  userId=NULL  → видно всем с доступом к этому scope
 *   USER:   userId=set,   scopeId=NULL → видно только этому пользователю
 *
 * scopeId — generic. Для чатов это chatId. Для будущих сущностей —
 * их group identifier (folderId, teamId, и т.д.).
 *
 * Потеря доступа к scope (выход, исключение, бан, удаление чата) пишется
 * user-scoped `CHAT delete`: scope-записи чата бывшему участнику больше не
 * видны, и без неё клиент не узнал бы, что чат пропал.
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
    @inject(FileUrlService) private readonly _fileUrls: FileUrlService,
  ) {}

  register(): void {
    // ── Messages (scope = chatId) ────────────────────────────────

    this._eventBus.on(MessageCreatedEvent, (event: MessageCreatedEvent) => {
      this._withPayload(this._messagePayload(event.message), payload =>
        this._logScopeScoped(
          event.chatId,
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.CREATE,
          payload,
          event.memberUserIds.filter(id => id !== event.message.senderId),
        ),
      );
    });

    this._eventBus.on(MessageUpdatedEvent, (event: MessageUpdatedEvent) => {
      this._withPayload(this._messagePayload(event.message), payload =>
        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.MESSAGE,
          event.message.id,
          ESyncAction.UPDATE,
          payload,
        ),
      );
    });

    this._eventBus.on(MessageDeletedEvent, (event: MessageDeletedEvent) => {
      if (!event.forAll) return;

      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.MESSAGE,
        event.messageId,
        ESyncAction.DELETE,
      );
    });

    // ── Chats (scope = chatId) ───────────────────────────────────

    this._eventBus.on(ChatCreatedEvent, (event: ChatCreatedEvent) => {
      this._withPayload(this._chatPayload(event.chat), payload =>
        this._logScopeScoped(
          event.chat.id,
          ESyncEntityType.CHAT,
          event.chat.id,
          ESyncAction.CREATE,
          payload,
          event.memberUserIds,
        ),
      );
    });

    this._eventBus.on(ChatUpdatedEvent, (event: ChatUpdatedEvent) => {
      this._withPayload(this._chatPayload(event.chat), payload =>
        this._logScopeScopedWithMemberLookup(
          event.chat.id,
          ESyncEntityType.CHAT,
          event.chat.id,
          ESyncAction.UPDATE,
          payload,
        ),
      );
    });

    // ── Chat Members (scope = chatId) ────────────────────────────

    this._eventBus.on(ChatMemberJoinedEvent, (event: ChatMemberJoinedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.CHAT_MEMBER,
        `${event.chatId}:${event.userId}`,
        ESyncAction.CREATE,
        {
          chatId: event.chatId,
          userId: event.userId,
          role: event.member?.role ?? null,
        },
      );
    });

    this._eventBus.on(
      ChatMemberRoleChangedEvent,
      (event: ChatMemberRoleChangedEvent) => {
        this._logScopeScopedWithMemberLookup(
          event.chatId,
          ESyncEntityType.CHAT_MEMBER,
          `${event.chatId}:${event.userId}`,
          ESyncAction.UPDATE,
          { chatId: event.chatId, userId: event.userId, role: event.role },
        );
      },
    );

    this._eventBus.on(ChatMemberLeftEvent, (event: ChatMemberLeftEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.CHAT_MEMBER,
        `${event.chatId}:${event.userId}`,
        ESyncAction.DELETE,
      );
      this._logChatRemovedForUser(event.chatId, event.userId);
    });

    this._eventBus.on(ChatMemberBannedEvent, (event: ChatMemberBannedEvent) => {
      this._logChatRemovedForUser(event.chatId, event.targetUserId);
    });

    this._eventBus.on(ChatDeletedEvent, (event: ChatDeletedEvent) => {
      for (const memberId of event.memberUserIds) {
        this._logChatRemovedForUser(event.chatId, memberId);
      }
    });

    // ── Личные настройки чата (user-scoped) ──────────────────────

    this._eventBus.on(ChatPinnedEvent, (event: ChatPinnedEvent) => {
      this._logUserScoped(
        event.userId,
        ESyncEntityType.CHAT_PIN,
        event.chatId,
        ESyncAction.UPDATE,
        { chatId: event.chatId, isPinned: event.isPinned },
      );
    });

    this._eventBus.on(ChatMutedEvent, (event: ChatMutedEvent) => {
      this._logUserScoped(
        event.userId,
        ESyncEntityType.CHAT_MUTE,
        event.chatId,
        ESyncAction.UPDATE,
        {
          chatId: event.chatId,
          mutedUntil: event.mutedUntil?.toISOString() ?? null,
        },
      );
    });

    this._eventBus.on(
      ChatMovedToFolderEvent,
      (event: ChatMovedToFolderEvent) => {
        this._logUserScoped(
          event.userId,
          ESyncEntityType.CHAT_FOLDER_ITEM,
          event.chatId,
          ESyncAction.UPDATE,
          { chatId: event.chatId, folderId: event.folderId },
        );
      },
    );

    // Удаление папки переносит её чаты в «без папки» без отдельных событий:
    // клиент сбрасывает folderId у чатов удалённой папки сам.
    this._eventBus.on(
      ChatFolderChangedEvent,
      (event: ChatFolderChangedEvent) => {
        this._logUserScoped(
          event.userId,
          ESyncEntityType.CHAT_FOLDER,
          event.folderId,
          FOLDER_CHANGE_ACTION[event.change],
          event.folder
            ? (event.folder as unknown as Record<string, unknown>)
            : { folderId: event.folderId },
        );
      },
    );

    // ── Закреплённые сообщения (scope = chatId) ──────────────────

    this._eventBus.on(MessagePinnedEvent, (event: MessagePinnedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.MESSAGE_PIN,
        event.message.id,
        ESyncAction.CREATE,
        {
          chatId: event.chatId,
          messageId: event.message.id,
          pinnedByUserId: event.pinnedByUserId,
        },
      );
    });

    this._eventBus.on(MessageUnpinnedEvent, (event: MessageUnpinnedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.MESSAGE_PIN,
        event.messageId,
        ESyncAction.DELETE,
        { chatId: event.chatId, messageId: event.messageId },
      );
    });

    // ── Опросы (scope = chatId) ──────────────────────────────────
    // Payload — только идентификаторы и статус: результаты зависят от
    // смотрящего (анонимность, свой голос), клиент перечитывает опрос по API.

    this._eventBus.on(PollCreatedEvent, (event: PollCreatedEvent) => {
      this._logScopeScoped(
        event.chatId,
        ESyncEntityType.POLL,
        event.poll.id,
        ESyncAction.CREATE,
        this._pollPayload(event.poll, event.chatId),
        event.memberUserIds,
      );
    });

    this._eventBus.on(PollVotedEvent, (event: PollVotedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.POLL,
        event.poll.id,
        ESyncAction.UPDATE,
        this._pollPayload(event.poll, event.chatId),
      );
    });

    this._eventBus.on(PollClosedEvent, (event: PollClosedEvent) => {
      this._logScopeScopedWithMemberLookup(
        event.chatId,
        ESyncEntityType.POLL,
        event.poll.id,
        ESyncAction.UPDATE,
        this._pollPayload(event.poll, event.chatId),
      );
    });

    // ── Contacts (user-scoped) ───────────────────────────────────

    this._eventBus.on(ContactRequestEvent, (event: ContactRequestEvent) => {
      this._logUserScoped(
        event.targetUserId,
        ESyncEntityType.CONTACT,
        event.contact.id,
        ESyncAction.CREATE,
        event.contact as unknown as Record<string, unknown>,
      );
    });

    this._eventBus.on(ContactAcceptedEvent, (event: ContactAcceptedEvent) => {
      this._logUserScoped(
        event.requesterId,
        ESyncEntityType.CONTACT,
        event.contact.id,
        ESyncAction.UPDATE,
        event.contact as unknown as Record<string, unknown>,
      );
    });
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** MessageDto с подписанными ссылками (вложения, аватары) для payload. */
  private async _messagePayload(
    message: Message,
  ): Promise<Record<string, unknown>> {
    const dto = await this._fileUrls.buildOneWithFiles(
      message,
      collectMessageFiles,
      MessageDto.fromEntity,
    );

    return dto as unknown as Record<string, unknown>;
  }

  /** ChatDto с подписанными ссылками (аватары чата и участников) для payload. */
  private async _chatPayload(chat: Chat): Promise<Record<string, unknown>> {
    const dto = await this._fileUrls.buildOneWithFiles(
      chat,
      collectChatFiles,
      (entity, files) => ChatDto.fromEntity(entity, files),
    );

    return dto as unknown as Record<string, unknown>;
  }

  /** Записать изменение, когда payload готов; сбой подписи — в лог. */
  private _withPayload(
    payload: Promise<Record<string, unknown>>,
    log: (payload: Record<string, unknown>) => void,
  ): void {
    payload.then(log).catch(err => {
      logger.error({ err }, "[SyncListener] Failed to build payload");
    });
  }

  private _pollPayload(
    poll: { id: string; messageId?: string; isClosed?: boolean },
    chatId: string,
  ): Record<string, unknown> {
    return {
      pollId: poll.id,
      chatId,
      messageId: poll.messageId ?? null,
      isClosed: poll.isClosed ?? false,
    };
  }

  /** Пользователь потерял доступ к чату: user-scoped `CHAT delete`. */
  private _logChatRemovedForUser(chatId: string, userId: string): void {
    this._logUserScoped(
      userId,
      ESyncEntityType.CHAT,
      chatId,
      ESyncAction.DELETE,
      { chatId },
    );
  }

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
