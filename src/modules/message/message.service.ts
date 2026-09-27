import { inject } from "inversify";
import { EntityManager, In } from "typeorm";

import {
  decodeCursor,
  encodeCursor,
  EventBus,
  Injectable,
  IPaginatedDto,
  logger,
  normalizePagination,
  PAGINATION_MAX_LIMIT,
  toPage,
} from "../../core";
import { ChatError } from "../chat/chat.errors";
import { ChatRepository } from "../chat/chat.repository";
import { ChatService } from "../chat/chat.service";
import { EChatMemberRole, EChatType } from "../chat/chat.types";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ChatLastMessageUpdatedEvent } from "../chat/events";
import { UserBlockService } from "../contact";
import { EFileStatus, File, FileUrlService } from "../file";
import { PollDto } from "../poll/dto/poll.dto";
import { PollRepository } from "../poll/poll.repository";
import {
  collectMessageFiles,
  collectReceiptFiles,
  IMediaStatsDto,
  IMessagePageDto,
  MediaItemDto,
  MessageDto,
  MessageReceiptDto,
} from "./dto";
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
import { Message } from "./message.entity";
import { MessageError } from "./message.errors";
import { IMessageKey, MessageRepository } from "./message.repository";
import {
  CLIENT_MESSAGE_TYPES,
  EMessageStatus,
  EMessageType,
} from "./message.types";
import { MessageAttachment } from "./message-attachment.entity";
import { MessageAttachmentRepository } from "./message-attachment.repository";
import { MessageDeletionRepository } from "./message-deletion.repository";
import { MessageMentionRepository } from "./message-mention.repository";
import { MessageReactionRepository } from "./message-reaction.repository";
import { MessageReceiptRepository } from "./message-receipt.repository";

export interface ISendMessageData {
  type?: EMessageType;
  content?: string;
  replyToId?: string;
  forwardedFromId?: string;
  fileIds?: string[];
  mentionedUserIds?: string[];
  mentionAll?: boolean;
  localId?: string;
}

/** Параметры внутренних вызовов sendMessage (другие сервисы, не клиент). */
export interface ISendMessageOptions {
  /** Разрешить служебные типы (POLL, SYSTEM). */
  allowServiceTypes?: boolean;
  /** Дополнительные записи в той же транзакции, что и сообщение. */
  onCreated?: (em: EntityManager, message: Message) => Promise<void>;
}

/** Параметры страницы истории сообщений. */
export interface IMessagePageQuery {
  /** Курсор из `nextCursor`/`prevCursor` предыдущей страницы. */
  cursor?: string;
  /** Окно вокруг сообщения (переход к сообщению); курсор не передаётся. */
  around?: string;
  limit?: number;
}

/** Минимальная длина поискового запроса. */
const MIN_SEARCH_LENGTH = 2;

/** Размер страницы истории по умолчанию. */
export const MESSAGE_PAGE_DEFAULT_LIMIT = 50;
/** Длина превью последнего сообщения в чате. */
const PREVIEW_LENGTH = 200;

const isAdminRole = (role: EChatMemberRole | undefined) =>
  role === EChatMemberRole.OWNER || role === EChatMemberRole.ADMIN;

const previewOf = (content: string | null) =>
  (content ?? "").slice(0, PREVIEW_LENGTH) || null;

const normalizeSearchQuery = (query: string | undefined) => {
  const trimmed = (query ?? "").trim();

  if (trimmed.length < MIN_SEARCH_LENGTH) {
    throw MessageError.SEARCH_QUERY_TOO_SHORT(
      { minLength: MIN_SEARCH_LENGTH },
      `Поисковый запрос должен содержать минимум ${MIN_SEARCH_LENGTH} символа`,
    );
  }

  return trimmed;
};

type TCursorDirection = "older" | "newer";

/** Курсор ленты: позиция сообщения и направление чтения от неё. */
interface IMessageCursor extends Record<string, unknown> {
  t: string;
  id: string;
  d: TCursorDirection;
}

const cursorOf = (message: IMessageKey, d: TCursorDirection) =>
  encodeCursor({ t: message.createdAt.toISOString(), id: message.id, d });

const parseCursor = (
  cursor: string,
): IMessageKey & { direction: TCursorDirection } => {
  const value = decodeCursor<IMessageCursor>(cursor);
  const createdAt = new Date(typeof value?.t === "string" ? value.t : NaN);

  if (
    !value ||
    Number.isNaN(createdAt.getTime()) ||
    typeof value.id !== "string" ||
    (value.d !== "older" && value.d !== "newer")
  ) {
    throw MessageError.INVALID_CURSOR();
  }

  return { createdAt, id: value.id, direction: value.d };
};

const clampPageLimit = (limit?: number) =>
  Number.isInteger(limit) && limit! > 0
    ? Math.min(limit!, PAGINATION_MAX_LIMIT)
    : MESSAGE_PAGE_DEFAULT_LIMIT;

@Injectable()
export class MessageService {
  constructor(
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(MessageAttachmentRepository)
    private _attachmentRepo: MessageAttachmentRepository,
    @inject(MessageReactionRepository)
    private _reactionRepo: MessageReactionRepository,
    @inject(MessageDeletionRepository)
    private _deletionRepo: MessageDeletionRepository,
    @inject(MessageMentionRepository)
    private _mentionRepo: MessageMentionRepository,
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatService) private _chatService: ChatService,
    @inject(PollRepository) private _pollRepo: PollRepository,
    @inject(MessageReceiptRepository)
    private _receiptRepo: MessageReceiptRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(UserBlockService) private _userBlockService: UserBlockService,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
  ) {}

  /**
   * Отправка сообщения. Проверяет право писать, блокировки в DIRECT,
   * slow mode, ссылки на ответ/пересылку и вложения; после транзакции
   * обновляет lastMessage и счётчики непрочитанного, затем эмитит события.
   */
  async sendMessage(
    chatId: string,
    senderId: string,
    data: ISendMessageData,
    options: ISendMessageOptions = {},
  ) {
    const type = data.type ?? EMessageType.TEXT;

    if (
      !options.allowServiceTypes &&
      !(CLIENT_MESSAGE_TYPES as readonly EMessageType[]).includes(type)
    ) {
      throw MessageError.INVALID_TYPE();
    }

    const [chat, membership] = await Promise.all([
      this._chatRepo.findOne({
        where: { id: chatId },
        select: { id: true, type: true, slowModeSeconds: true },
      }),
      this._memberRepo.findMembership(chatId, senderId),
    ]);

    if (!chat) {
      throw ChatError.NOT_FOUND();
    }

    if (
      !membership ||
      (chat.type === EChatType.CHANNEL && !isAdminRole(membership.role))
    ) {
      throw MessageError.SEND_FORBIDDEN();
    }

    if (chat.type === EChatType.DIRECT) {
      await this._assertNotBlocked(chatId, senderId);
    }

    if (!isAdminRole(membership.role)) {
      await this._assertSlowMode(chatId, senderId, chat.slowModeSeconds ?? 0);
    }

    await this._assertMessageRefs(chatId, senderId, data);

    const fileIds = [...new Set(data.fileIds ?? [])];

    const message = await this._messageRepo.withTransaction(
      async (repo, em) => {
        if (fileIds.length > 0) {
          await this._assertAttachableFiles(em, fileIds, senderId);
        }

        const saved = await repo.save(
          repo.create({
            chatId,
            senderId,
            type,
            content: data.content ?? null,
            replyToId: data.replyToId ?? null,
            forwardedFromId: data.forwardedFromId ?? null,
          }),
        );

        const batchOps: Promise<unknown>[] = [];

        if (fileIds.length > 0) {
          batchOps.push(
            em.getRepository(MessageAttachment).save(
              fileIds.map(fileId => ({
                messageId: saved.id,
                fileId,
              })),
            ),
          );
        }

        const mentions = [
          ...(data.mentionAll
            ? [{ messageId: saved.id, userId: null, isAll: true }]
            : []),
          ...[...new Set(data.mentionedUserIds ?? [])].map(uid => ({
            messageId: saved.id,
            userId: uid,
            isAll: false,
          })),
        ];

        if (mentions.length > 0) {
          batchOps.push(em.getRepository("message_mentions").save(mentions));
        }

        await Promise.all(batchOps);
        await options.onCreated?.(em, saved);

        return saved;
      },
    );

    // lastMessage и счётчики должны быть в БД до эмиссии событий:
    // слушатели читают их сразу.
    await this._advanceChatLastMessage(chatId, message);
    await this._memberRepo.incrementUnreadForChat(chatId, senderId);

    if (chat.type === EChatType.DIRECT) {
      await this._memberRepo.unhideForChat(chatId);
    }

    const fullMessage = await this._messageRepo.findById(message.id);

    if (!fullMessage) {
      throw MessageError.NOT_FOUND();
    }

    const [dto] = await this._toDtos([fullMessage], senderId);

    dto.localId = data.localId;

    // localId прокидывается в событие, чтобы клиенты отправителя дедуплицировали
    this._emitSendMessageEvents(
      chatId,
      fullMessage,
      data.mentionedUserIds ?? [],
      data.mentionAll ?? false,
      data.localId,
      dto.poll ?? undefined,
    ).catch(err => {
      logger.warn({ err }, "Failed to emit message events");
    });

    return dto;
  }

  /**
   * История чата, от новых к старым. Без курсора — последние сообщения;
   * `nextCursor` ведёт к более старым, `prevCursor` — к более новым (есть,
   * когда страница не последняя: после `around` или перехода по курсору).
   */
  async getMessages(
    chatId: string,
    userId: string,
    query: IMessagePageQuery = {},
  ): Promise<IMessagePageDto> {
    await this._assertMember(chatId, userId);

    const limit = clampPageLimit(query.limit);
    let messages: Message[];
    let hasOlder: boolean;
    let hasNewer: boolean;

    if (query.around) {
      const window = await this._messageRepo.findAround(
        chatId,
        userId,
        query.around,
        limit,
      );

      if (!window) throw MessageError.NOT_FOUND();

      ({ messages, hasOlder, hasNewer } = window);
    } else if (query.cursor) {
      const { direction, ...key } = parseCursor(query.cursor);

      if (direction === "older") {
        const page = await this._messageRepo.findOlder(
          chatId,
          userId,
          key,
          limit,
        );

        messages = page.messages;
        hasOlder = page.hasMore;
        hasNewer = true;
      } else {
        const page = await this._messageRepo.findNewer(
          chatId,
          userId,
          key,
          limit,
        );

        messages = page.messages;
        hasOlder = true;
        hasNewer = page.hasMore;
      }
    } else {
      const page = await this._messageRepo.findOlder(
        chatId,
        userId,
        null,
        limit,
      );

      messages = page.messages;
      hasOlder = page.hasMore;
      hasNewer = false;
    }

    const dtos = await this._toDtos(messages, userId);
    const newest = messages[0];
    const oldest = messages[messages.length - 1];

    return {
      items: dtos,
      nextCursor: hasOlder && oldest ? cursorOf(oldest, "older") : null,
      prevCursor: hasNewer && newest ? cursorOf(newest, "newer") : null,
    };
  }

  /** Редактировать можно только свой текст в чате, где пользователь ещё состоит. */
  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    if (message.senderId !== userId) {
      throw MessageError.NOT_AUTHOR();
    }

    if (message.isDeleted) {
      throw MessageError.DELETED();
    }

    if (message.type !== EMessageType.TEXT) {
      throw MessageError.NOT_EDITABLE();
    }

    await this._assertMember(message.chatId, userId);

    message.content = content;
    message.isEdited = true;
    await this._messageRepo.save(message);

    const editResult = await this._chatRepo
      .createQueryBuilder()
      .update()
      .set({ lastMessageContent: previewOf(content) })
      .where("id = :chatId", { chatId: message.chatId })
      .andWhere("last_message_id = :messageId", { messageId })
      .execute();

    this._eventBus.emit(new MessageUpdatedEvent(message, message.chatId));

    if (editResult.affected && editResult.affected > 0) {
      this._emitLastMessageUpdated(message.chatId).catch(err => {
        logger.warn({ err }, "Failed to emit lastMessage update");
      });
    }

    const [dto] = await this._toDtos([message], userId);

    return dto;
  }

  async deleteMessage(messageId: string, userId: string, forAll: boolean) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    if (!forAll) {
      await this._assertMember(message.chatId, userId);
      await this._deletionRepo.deleteForUser(messageId, userId);

      this._eventBus.emit(
        new MessageDeletedEvent(messageId, message.chatId, false, userId),
      );

      return;
    }

    // Удаление для всех — sender или admin/owner
    if (message.senderId !== userId) {
      const membership = await this._memberRepo.findMembership(
        message.chatId,
        userId,
      );

      if (!membership || !isAdminRole(membership.role)) {
        throw MessageError.DELETE_FORBIDDEN();
      }
    }

    // Условный UPDATE: повтор или параллельный запрос не декрементирует
    // счётчики второй раз.
    if (
      message.isDeleted ||
      !(await this._messageRepo.markDeleted(messageId))
    ) {
      throw MessageError.ALREADY_DELETED();
    }

    message.isDeleted = true;

    await this._messageRepo
      .createQueryBuilder()
      .update()
      .set({ replyToId: null })
      .where("reply_to_id = :messageId", { messageId })
      .execute();

    if (message.senderId) {
      await this._memberRepo.decrementUnreadForDeletedMessage(
        message.chatId,
        message.senderId,
        message.createdAt,
      );
    }

    if (message.type === EMessageType.POLL) {
      await this._pollRepo.update(
        { messageId, isClosed: false },
        { isClosed: true, closedAt: new Date() },
      );
    }

    const wasLastMessage = await this._recalcLastMessage(
      message.chatId,
      messageId,
    );

    this._eventBus.emit(
      new MessageDeletedEvent(messageId, message.chatId, true, userId),
    );

    if (wasLastMessage) {
      await this._emitLastMessageUpdated(message.chatId);
    }
  }

  async pinMessage(messageId: string, userId: string) {
    const message = await this._findMessageForPin(messageId, userId);

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedById = userId;
    await this._messageRepo.save(message);

    this._eventBus.emit(
      new MessagePinnedEvent(message, message.chatId, userId),
    );

    const [dto] = await this._toDtos([message], userId);

    return dto;
  }

  async unpinMessage(messageId: string, userId: string) {
    const message = await this._findMessageForPin(messageId, userId);

    message.isPinned = false;
    message.pinnedAt = null;
    message.pinnedById = null;
    await this._messageRepo.save(message);

    this._eventBus.emit(new MessageUnpinnedEvent(messageId, message.chatId));
  }

  async getPinnedMessages(
    chatId: string,
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    await this._assertMember(chatId, userId);

    const page = normalizePagination(offset, limit);
    const [messages, total] = await this._messageRepo.findPinnedByChatId(
      chatId,
      userId,
      page.offset,
      page.limit,
    );

    return toPage(await this._toDtos(messages, userId), total, page);
  }

  /** Максимальное количество messageIds в одном вызове mark*. */
  private static readonly MAX_BATCH_SIZE = 200;

  async markAsDelivered(chatId: string, userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return;

    const ids = messageIds.slice(0, MessageService.MAX_BATCH_SIZE);

    await this._assertMember(chatId, userId);

    const foreignMessages = await this._messageRepo.find({
      where: { chatId, id: In(ids) },
      select: { id: true, senderId: true },
    });

    const foreignIds = foreignMessages
      .filter(m => m.senderId !== userId)
      .map(m => m.id);

    if (foreignIds.length === 0) return;

    await this._messageRepo.withTransaction(async (_repo, em) => {
      await this._receiptRepo.upsertReceipts(
        chatId,
        userId,
        foreignIds,
        EMessageStatus.DELIVERED,
        em,
      );

      // Глобальный статус только SENT → DELIVERED (READ не понижаем)
      await em
        .createQueryBuilder()
        .update("messages")
        .set({ status: EMessageStatus.DELIVERED })
        .where("chat_id = :chatId", { chatId })
        .andWhere("id IN (:...foreignIds)", { foreignIds })
        .andWhere("sender_id != :userId", { userId })
        .andWhere("status = :sent", { sent: EMessageStatus.SENT })
        .execute();
    });

    this._eventBus.emit(new MessageDeliveredEvent(foreignIds, chatId, userId));
  }

  /**
   * Прочтение: счётчик непрочитанного уменьшается на число receipts,
   * реально перешедших в READ, атомарным UPDATE — повтор тех же id и
   * параллельные вызовы не уводят его в минус и не теряют обновления.
   */
  async markAsRead(chatId: string, userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return;

    const ids = messageIds.slice(0, MessageService.MAX_BATCH_SIZE);

    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw ChatError.NOT_MEMBER();
    }

    const foreignMessages = (
      await this._messageRepo.find({
        where: { chatId, id: In(ids), isDeleted: false },
        select: { id: true, senderId: true, createdAt: true },
      })
    ).filter(m => m.senderId !== userId);

    if (foreignMessages.length === 0) return;

    const foreignIds = foreignMessages.map(m => m.id);

    const newlyReadIds = await this._messageRepo.withTransaction(
      async (_repo, em) => {
        const advanced = await this._receiptRepo.upsertReceipts(
          chatId,
          userId,
          foreignIds,
          EMessageStatus.READ,
          em,
        );

        if (advanced.length === 0) return advanced;

        await em
          .createQueryBuilder()
          .update("messages")
          .set({ status: EMessageStatus.READ })
          .where("chat_id = :chatId", { chatId })
          .andWhere("id IN (:...advanced)", { advanced })
          .andWhere("sender_id != :userId", { userId })
          .andWhere("status != :read", { read: EMessageStatus.READ })
          .execute();

        const newest = foreignMessages
          .filter(m => advanced.includes(m.id))
          .reduce((a, b) => (b.createdAt > a.createdAt ? b : a));

        await this._applyReadToMembership(
          em,
          chatId,
          userId,
          advanced.length,
          newest,
        );

        return advanced;
      },
    );

    if (newlyReadIds.length === 0) return;

    this._eventBus.emit(new MessageReadEvent(chatId, userId, newlyReadIds));
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    await this._assertMember(message.chatId, userId);

    const existing = await this._reactionRepo.findByUserAndMessage(
      userId,
      messageId,
    );

    if (existing) {
      existing.emoji = emoji;
      await this._reactionRepo.save(existing);
    } else {
      await this._reactionRepo.createAndSave({
        messageId,
        userId,
        emoji,
      });
    }

    this._eventBus.emit(
      new MessageReactionEvent(messageId, message.chatId, userId, emoji),
    );
  }

  async removeReaction(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    const existing = await this._reactionRepo.findByUserAndMessage(
      userId,
      messageId,
    );

    if (existing) {
      await this._reactionRepo.delete({ id: existing.id });

      this._eventBus.emit(
        new MessageReactionEvent(messageId, message.chatId, userId, null),
      );
    }
  }

  async searchMessages(
    chatId: string,
    userId: string,
    query: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    const normalized = normalizeSearchQuery(query);

    await this._assertMember(chatId, userId);

    const page = normalizePagination(offset, limit);
    const [messages, total] = await this._messageRepo.searchInChat(
      chatId,
      userId,
      normalized,
      page.offset,
      page.limit,
    );

    return toPage(await this._toDtos(messages, userId), total, page);
  }

  async searchGlobalMessages(
    userId: string,
    query: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<MessageDto>> {
    const normalized = normalizeSearchQuery(query);
    const page = normalizePagination(offset, limit);
    const chatIds = await this._memberRepo.getUserChatIds(userId);

    if (chatIds.length === 0) return toPage([], 0, page);

    const [messages, total] = await this._messageRepo.searchGlobal(
      chatIds,
      userId,
      normalized,
      page.offset,
      page.limit,
    );

    return toPage(await this._toDtos(messages, userId), total, page);
  }

  async getChatMedia(
    chatId: string,
    userId: string,
    type?: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<MediaItemDto>> {
    await this._assertMember(chatId, userId);

    const page = normalizePagination(offset, limit);
    const [messages, total] = await this._messageRepo.findMediaByChatId(
      chatId,
      userId,
      type,
      page.offset,
      page.limit,
    );

    const dtos = await this._fileUrls.buildWithFiles(
      messages,
      collectMessageFiles,
      MediaItemDto.fromEntity,
    );

    return toPage(dtos, total, page);
  }

  async getChatMediaStats(
    chatId: string,
    userId: string,
  ): Promise<IMediaStatsDto> {
    await this._assertMember(chatId, userId);

    return this._messageRepo.getMediaStats(chatId, userId);
  }

  /**
   * Получить unread counts для всех чатов пользователя.
   * Читает денормализованный счётчик из chat_members — O(1) per chat, без COUNT(*).
   */
  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    return this._memberRepo.getUnreadCounts(userId);
  }

  /**
   * Получить unread count для конкретного чата.
   * Читает денормализованный счётчик из chat_members.
   */
  async getUnreadCount(chatId: string, userId: string): Promise<number> {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    return membership?.unreadCount ?? 0;
  }

  /** Получить детальную информацию о receipts для сообщения (кто прочитал/получил). */
  async getReceiptInfo(
    messageId: string,
    userId: string,
  ): Promise<MessageReceiptDto[]> {
    const message = await this._messageRepo.findOne({
      where: { id: messageId },
      select: { id: true, chatId: true, senderId: true },
    });

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    await this._assertMember(message.chatId, userId);

    const receipts = await this._receiptRepo.findByMessageId(messageId);

    return this._fileUrls.buildWithFiles(
      receipts,
      collectReceiptFiles,
      MessageReceiptDto.fromEntity,
    );
  }

  private async _assertMember(chatId: string, userId: string) {
    if (!(await this._chatService.isMember(chatId, userId))) {
      throw ChatError.NOT_MEMBER();
    }
  }

  /** DTO с подписанными ссылками файлов (пачкой) и данными опросов. */
  private async _toDtos(messages: Message[], userId: string) {
    const dtos = await this._fileUrls.buildWithFiles(
      messages,
      collectMessageFiles,
      MessageDto.fromEntity,
    );

    await this._enrichWithPolls(dtos, userId);

    return dtos;
  }

  /** В DIRECT нельзя писать, если кто-то из двоих заблокировал другого. */
  private async _assertNotBlocked(chatId: string, senderId: string) {
    const memberIds = await this._memberRepo.getMemberUserIds(chatId);
    const partnerId = memberIds.find(id => id !== senderId);

    if (
      partnerId &&
      (await this._userBlockService.isBlockedEither(senderId, partnerId))
    ) {
      throw MessageError.USER_BLOCKED();
    }
  }

  /** Slow mode: между сообщениями участника — не меньше `slowModeSeconds`. */
  private async _assertSlowMode(
    chatId: string,
    senderId: string,
    slowModeSeconds: number,
  ) {
    if (slowModeSeconds <= 0) return;

    const last = await this._messageRepo.findLastBySender(chatId, senderId);

    if (!last) return;

    const waitMs =
      last.createdAt.getTime() + slowModeSeconds * 1000 - Date.now();

    if (waitMs > 0) {
      const retryAfter = Math.ceil(waitMs / 1000);

      throw MessageError.SLOW_MODE(
        { retryAfter },
        `Slow mode: следующее сообщение через ${retryAfter} с`,
      );
    }
  }

  /**
   * Ответ — только на сообщение этого же чата; переслать можно только из
   * чата, где отправитель состоит.
   */
  private async _assertMessageRefs(
    chatId: string,
    senderId: string,
    data: ISendMessageData,
  ) {
    if (data.replyToId) {
      const replyTo = await this._messageRepo.findOne({
        where: { id: data.replyToId },
        select: { id: true, chatId: true, isDeleted: true },
      });

      if (!replyTo || replyTo.chatId !== chatId || replyTo.isDeleted) {
        throw MessageError.REPLY_NOT_FOUND();
      }
    }

    if (data.forwardedFromId) {
      const original = await this._messageRepo.findOne({
        where: { id: data.forwardedFromId },
        select: { id: true, chatId: true, isDeleted: true },
      });

      if (
        !original ||
        original.isDeleted ||
        !(await this._chatService.isMember(original.chatId, senderId))
      ) {
        throw MessageError.FORWARD_NOT_FOUND();
      }
    }
  }

  /**
   * Вложения: файлы существуют, принадлежат отправителю, загрузка завершена
   * (не `pending`) и ещё ни к чему не прикреплены. Строки файлов блокируются до конца транзакции, чтобы
   * параллельная отправка с тем же файлом дождалась и увидела вложение.
   */
  private async _assertAttachableFiles(
    em: EntityManager,
    fileIds: string[],
    senderId: string,
  ) {
    const files = await em.getRepository(File).find({
      where: { id: In(fileIds) },
      select: { id: true, ownerId: true, status: true },
      lock: { mode: "pessimistic_write" },
    });

    if (
      files.length !== fileIds.length ||
      files.some(file => file.ownerId !== senderId)
    ) {
      throw MessageError.ATTACHMENT_NOT_FOUND();
    }

    const pending = files.filter(file => file.status === EFileStatus.Pending);

    if (pending.length > 0) {
      throw MessageError.ATTACHMENT_NOT_READY({
        fileIds: pending.map(file => file.id),
      });
    }

    const attached = await em
      .getRepository(MessageAttachment)
      .count({ where: { fileId: In(fileIds) } });

    if (attached > 0) {
      throw MessageError.ATTACHMENT_IN_USE();
    }
  }

  /** Сообщение, которое пользователь вправе закрепить/открепить. */
  private async _findMessageForPin(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw MessageError.NOT_FOUND();
    }

    const [chat, membership] = await Promise.all([
      this._chatRepo.findOne({
        where: { id: message.chatId },
        select: { id: true, type: true },
      }),
      this._memberRepo.findMembership(message.chatId, userId),
    ]);

    if (!chat || !membership) {
      throw ChatError.NOT_MEMBER();
    }

    if (chat.type !== EChatType.DIRECT && !isAdminRole(membership.role)) {
      throw MessageError.PIN_FORBIDDEN();
    }

    if (message.isDeleted) {
      throw MessageError.DELETED();
    }

    return message;
  }

  /**
   * Счётчик уменьшается в БД (без read-modify-write), указатель прочтения
   * двигается только вперёд.
   */
  private async _applyReadToMembership(
    em: EntityManager,
    chatId: string,
    userId: string,
    readCount: number,
    newest: Pick<Message, "id" | "createdAt">,
  ) {
    await em.query(
      `UPDATE chat_members
       SET unread_count = GREATEST(0, unread_count - $3),
           last_read_message_id = CASE
             WHEN last_read_message_id IS NULL
               OR COALESCE(
                 (SELECT created_at FROM messages WHERE id = last_read_message_id),
                 '-infinity'::timestamptz
               ) < $5
             THEN $4::uuid
             ELSE last_read_message_id
           END
       WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId, readCount, newest.id, newest.createdAt],
    );
  }

  /**
   * lastMessage чата двигается только вперёд: при гонке двух отправок
   * более старое сообщение не перетирает более новое.
   */
  private async _advanceChatLastMessage(chatId: string, message: Message) {
    await this._chatRepo
      .createQueryBuilder()
      .update()
      .set({
        lastMessageAt: message.createdAt,
        lastMessageId: message.id,
        lastMessageContent: previewOf(message.content),
        lastMessageType: message.type,
        lastMessageSenderId: message.senderId,
      })
      .where("id = :chatId", { chatId })
      .andWhere("(last_message_at IS NULL OR last_message_at < :createdAt)", {
        createdAt: message.createdAt,
      })
      .execute();
  }

  /** Эмиссия событий после отправки сообщения (fire-and-forget). */
  private async _emitSendMessageEvents(
    chatId: string,
    message: Message,
    mentionedUserIds: string[],
    mentionAll: boolean,
    localId?: string,
    poll?: PollDto,
  ) {
    const [memberUserIds, updatedChat] = await Promise.all([
      this._chatService.getMemberUserIds(chatId),
      this._chatRepo.findOne({
        where: { id: chatId },
        relations: { lastMessageSender: { profile: true } },
      }),
    ]);

    this._eventBus.emit(
      new MessageCreatedEvent(
        message,
        chatId,
        memberUserIds,
        mentionedUserIds,
        mentionAll,
        localId,
        poll,
      ),
    );

    if (updatedChat) {
      this._eventBus.emit(
        new ChatLastMessageUpdatedEvent(updatedChat, memberUserIds),
      );
    }
  }

  /** Отправить событие обновления lastMessage для чата. */
  private async _emitLastMessageUpdated(chatId: string) {
    const chat = await this._chatRepo.findOne({
      where: { id: chatId },
      relations: { lastMessageSender: { profile: true } },
    });

    if (!chat) return;

    const memberUserIds = await this._chatService.getMemberUserIds(chatId);

    this._eventBus.emit(new ChatLastMessageUpdatedEvent(chat, memberUserIds));
  }

  /** Пересчитать денормализованное lastMessage для чата, если удалённое сообщение было последним. */
  private async _recalcLastMessage(
    chatId: string,
    deletedMessageId: string,
  ): Promise<boolean> {
    const chat = await this._chatRepo.findOne({
      where: { id: chatId },
      select: { id: true, type: true, lastMessageId: true },
    });

    if (!chat || chat.lastMessageId !== deletedMessageId) return false;

    const prev = await this._messageRepo.findOne({
      where: { chatId, isDeleted: false },
      order: { createdAt: "DESC" },
      relations: { sender: { profile: true } },
    });

    if (prev) {
      await this._chatRepo.update(chatId, {
        lastMessageId: prev.id,
        lastMessageContent: previewOf(prev.content),
        lastMessageType: prev.type,
        lastMessageSenderId: prev.senderId,
        lastMessageAt: prev.createdAt,
      });
    } else {
      await this._chatRepo.update(chatId, {
        lastMessageId: null,
        lastMessageContent: null,
        lastMessageType: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
      });
    }

    return true;
  }

  /** Batch-загрузка poll данных для сообщений с type=POLL. */
  private async _enrichWithPolls(
    dtos: MessageDto[],
    userId: string,
  ): Promise<void> {
    const pollMessageIds = dtos
      .filter(d => d.type === EMessageType.POLL)
      .map(d => d.id);

    if (pollMessageIds.length === 0) return;

    const polls = await this._pollRepo.findByMessageIds(pollMessageIds);
    const pollMap = new Map(polls.map(p => [p.messageId, p]));

    for (const dto of dtos) {
      const poll = pollMap.get(dto.id);

      if (poll) {
        dto.poll = new PollDto(poll, userId);
      }
    }
  }
}
