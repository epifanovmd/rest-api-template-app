import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";
import { In } from "typeorm";

import { EventBus, Injectable, logger } from "../../core";
import { ChatRepository } from "../chat/chat.repository";
import { ChatService } from "../chat/chat.service";
import { EChatMemberRole, EChatType } from "../chat/chat.types";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ChatLastMessageUpdatedEvent } from "../chat/events";
import { PollDto } from "../poll/dto/poll.dto";
import { PollRepository } from "../poll/poll.repository";
import { IMediaStatsDto, MediaItemDto, MessageDto, MessageReceiptDto } from "./dto";
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
import { MessageRepository } from "./message.repository";
import { EMessageStatus, EMessageType } from "./message.types";
import { MessageAttachmentRepository } from "./message-attachment.repository";
import { MessageDeletionRepository } from "./message-deletion.repository";
import { MessageMentionRepository } from "./message-mention.repository";
import { MessageReactionRepository } from "./message-reaction.repository";
import { MessageReceiptRepository } from "./message-receipt.repository";

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
  ) {}

  async sendMessage(
    chatId: string,
    senderId: string,
    data: {
      type?: EMessageType;
      content?: string;
      replyToId?: string;
      forwardedFromId?: string;
      fileIds?: string[];
      mentionedUserIds?: string[];
      mentionAll?: boolean;
      localId?: string;
    },
  ) {
    // Параллельная загрузка чата и членства (вместо canSendMessage + повторного fetch)
    const [chat, membership] = await Promise.all([
      this._chatRepo.findOne({
        where: { id: chatId },
        select: ["id", "type"],
      }),
      this._memberRepo.findMembership(chatId, senderId),
    ]);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    // Проверка прав на отправку
    if (chat.type === EChatType.CHANNEL) {
      if (
        !membership ||
        (membership.role !== EChatMemberRole.OWNER &&
          membership.role !== EChatMemberRole.ADMIN)
      ) {
        throw new ForbiddenException(
          "Вы не можете отправлять сообщения в этот чат",
        );
      }
    } else if (!membership) {
      throw new ForbiddenException(
        "Вы не можете отправлять сообщения в этот чат",
      );
    }

    const message = await this._messageRepo.withTransaction(
      async (repo, em) => {
        const msg = repo.create({
          chatId,
          senderId,
          type: data.type ?? EMessageType.TEXT,
          content: data.content ?? null,
          replyToId: data.replyToId ?? null,
          forwardedFromId: data.forwardedFromId ?? null,
        });

        const saved = await repo.save(msg);

        // Вложения и упоминания — параллельно (оба зависят только от saved.id)
        const batchOps: Promise<unknown>[] = [];

        if (data.fileIds && data.fileIds.length > 0) {
          batchOps.push(
            em.getRepository("message_attachments").save(
              data.fileIds.map(fileId => ({
                messageId: saved.id,
                fileId,
              })),
            ),
          );
        }

        if (data.mentionedUserIds || data.mentionAll) {
          const mentions: {
            messageId: string;
            userId: string | null;
            isAll: boolean;
          }[] = [];

          if (data.mentionAll) {
            mentions.push({
              messageId: saved.id,
              userId: null,
              isAll: true,
            });
          }

          if (data.mentionedUserIds) {
            for (const uid of data.mentionedUserIds) {
              mentions.push({
                messageId: saved.id,
                userId: uid,
                isAll: false,
              });
            }
          }

          batchOps.push(em.getRepository("message_mentions").save(mentions));
        }

        if (batchOps.length > 0) {
          await Promise.all(batchOps);
        }

        return saved;
      },
    );

    // Chat lastMessage update — вне транзакции, fire-and-forget
    // Денормализованный кэш, не требует атомарности с INSERT сообщения
    const previewContent = (message.content ?? "").slice(0, 200) || null;

    // lastMessage — fire-and-forget (денормализованный кэш, не критично)
    this._chatRepo
      .update(chatId, {
        lastMessageAt: message.createdAt,
        lastMessageId: message.id,
        lastMessageContent: previewContent,
        lastMessageType: message.type,
        lastMessageSenderId: message.senderId,
      })
      .catch(err => {
        logger.warn({ err }, "Failed to update chat lastMessage");
      });

    // unread_count increment ДОЛЖЕН завершиться ДО emit events,
    // иначе listener прочитает старое значение.
    await this._memberRepo.incrementUnreadForChat(chatId, senderId);

    // Загрузка сообщения с relations для ответа клиенту
    const fullMessage = await this._messageRepo.findById(message.id);

    if (!fullMessage) {
      throw new NotFoundException("Сообщение не найдено после создания");
    }

    // Эмиссия событий — fire-and-forget (клиент не ждёт)
    // localId прокидывается в event чтобы все клиенты отправителя могли дедуплицировать
    this._emitSendMessageEvents(
      chatId,
      fullMessage,
      data.mentionedUserIds ?? [],
      data.mentionAll ?? false,
      data.localId,
    ).catch(err => {
      logger.warn({ err }, "Failed to emit message events");
    });

    const dto = MessageDto.fromEntity(fullMessage);

    dto.localId = data.localId;

    return dto;
  }

  async getMessages(
    chatId: string,
    userId: string,
    before?: string,
    limit?: number,
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const { messages, hasMore } = await this._messageRepo.findByChatCursor(
      chatId,
      userId,
      before,
      limit ?? 50,
    );

    const dtos = messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return {
      data: dtos,
      hasMore,
    };
  }

  async getMessagesAfter(
    chatId: string,
    userId: string,
    after: string,
    limit?: number,
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const { messages, hasNewer } = await this._messageRepo.findAfterCursor(
      chatId,
      userId,
      after,
      limit ?? 50,
    );

    const dtos = messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return {
      data: dtos,
      hasMore: false as const,
      hasNewer,
    };
  }

  async getMessagesAround(
    chatId: string,
    userId: string,
    messageId: string,
    limit?: number,
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const result = await this._messageRepo.findAroundMessage(
      chatId,
      userId,
      messageId,
      limit ?? 50,
    );

    if (!result) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const dtos = result.messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return {
      data: dtos,
      hasMore: result.hasMore,
      hasNewer: result.hasNewer,
    };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException("Можно редактировать только свои сообщения");
    }

    if (message.isDeleted) {
      throw new BadRequestException("Сообщение удалено");
    }

    message.content = content;
    message.isEdited = true;
    await this._messageRepo.save(message);

    const previewContent = content.slice(0, 200) || null;

    const editResult = await this._chatRepo
      .createQueryBuilder()
      .update()
      .set({ lastMessageContent: previewContent })
      .where("id = :chatId", { chatId: message.chatId })
      .andWhere("lastMessageId = :messageId", { messageId })
      .execute();

    this._eventBus.emit(new MessageUpdatedEvent(message, message.chatId));

    if (editResult.affected && editResult.affected > 0) {
      this._emitLastMessageUpdated(message.chatId).catch(err => {
        logger.warn({ err }, "Failed to emit lastMessage update");
      });
    }

    return MessageDto.fromEntity(message);
  }

  async deleteMessage(messageId: string, userId: string, forAll: boolean) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (forAll) {
      // Удаление для всех — проверяем права (sender / admin / owner)
      if (message.senderId !== userId) {
        const membership = await this._memberRepo.findMembership(
          message.chatId,
          userId,
        );

        if (!membership || membership.role === EChatMemberRole.MEMBER) {
          throw new ForbiddenException(
            "Недостаточно прав для удаления сообщения",
          );
        }
      }

      message.isDeleted = true;
      await this._messageRepo.save(message);

      // Обнулить ссылки replyToId на удалённое сообщение
      await this._messageRepo
        .createQueryBuilder()
        .update()
        .set({ replyToId: null })
        .where("replyToId = :messageId", { messageId })
        .execute();

      // Декремент unread_count у участников, которые НЕ прочитали это сообщение.
      // Сообщение непрочитано, если lastReadMessageId NULL или lastReadMessage.createdAt < message.createdAt.
      if (message.senderId) {
        this._memberRepo
          .decrementUnreadForDeletedMessage(message.chatId, message.senderId, message.createdAt)
          .catch(err => {
            logger.warn({ err }, "Failed to decrement unread on delete");
          });
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
    } else {
      // Удаление только для себя — проверяем членство в чате
      const isMember = await this._chatService.isMember(
        message.chatId,
        userId,
      );

      if (!isMember) {
        throw new ForbiddenException("Вы не являетесь участником этого чата");
      }

      await this._deletionRepo.deleteForUser(messageId, userId);

      this._eventBus.emit(
        new MessageDeletedEvent(messageId, message.chatId, false, userId),
      );
    }
  }

  async pinMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedById = userId;
    await this._messageRepo.save(message);

    this._eventBus.emit(
      new MessagePinnedEvent(message, message.chatId, userId),
    );

    return MessageDto.fromEntity(message);
  }

  async unpinMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    message.isPinned = false;
    message.pinnedAt = null;
    message.pinnedById = null;
    await this._messageRepo.save(message);

    this._eventBus.emit(new MessageUnpinnedEvent(messageId, message.chatId));
  }

  async getPinnedMessages(chatId: string, userId: string) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const messages = await this._messageRepo.findPinnedByChatId(chatId, userId);

    const dtos = messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return dtos;
  }

  /** Максимальное количество messageIds в одном вызове mark*. */
  private static readonly MAX_BATCH_SIZE = 200;

  async markAsDelivered(chatId: string, userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return;

    // Защита от слишком большого batch
    const ids = messageIds.slice(0, MessageService.MAX_BATCH_SIZE);

    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) return;

    // Фильтруем только чужие сообщения
    const foreignMessages = await this._messageRepo.find({
      where: { chatId, id: In(ids) },
      select: ["id", "senderId"],
    });

    const foreignIds = foreignMessages
      .filter(m => m.senderId !== userId)
      .map(m => m.id);

    if (foreignIds.length === 0) return;

    // Транзакция: receipts + message status update атомарно
    await this._messageRepo.withTransaction(async (_repo, em) => {
      // 1. Per-user receipts
      await this._receiptRepo.upsertReceipts(
        chatId,
        userId,
        foreignIds,
        EMessageStatus.DELIVERED,
      );

      // 2. Обновляем глобальный статус только SENT → DELIVERED
      //    (не трогаем сообщения уже в READ — защита от регрессии)
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

  async markAsRead(chatId: string, userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return;

    // Защита от слишком большого batch
    const ids = messageIds.slice(0, MessageService.MAX_BATCH_SIZE);

    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    // Фильтруем только чужие сообщения
    const foreignMessages = await this._messageRepo.find({
      where: { chatId, id: In(ids) },
      select: ["id", "senderId", "createdAt"],
    });

    const foreignIds = foreignMessages
      .filter(m => m.senderId !== userId)
      .map(m => m.id);

    if (foreignIds.length === 0) return;

    // Транзакция: receipts + message status + lastReadMessageId атомарно
    await this._messageRepo.withTransaction(async (_repo, em) => {
      // 1. Per-user receipts
      await this._receiptRepo.upsertReceipts(
        chatId,
        userId,
        foreignIds,
        EMessageStatus.READ,
      );

      // 2. Update global status — SENT/DELIVERED → READ
      //    (READ → READ — no-op, protected by WHERE)
      await em
        .createQueryBuilder()
        .update("messages")
        .set({ status: EMessageStatus.READ })
        .where("chat_id = :chatId", { chatId })
        .andWhere("id IN (:...foreignIds)", { foreignIds })
        .andWhere("sender_id != :userId", { userId })
        .andWhere("status != :read", { read: EMessageStatus.READ })
        .execute();

      // 3. Advance lastReadMessageId + decrement unread_count
      const newestRead = foreignMessages.reduce<
        (typeof foreignMessages)[0] | null
      >((newest, msg) => {
        if (!newest || msg.createdAt > newest.createdAt) return msg;

        return newest;
      }, null);

      if (newestRead) {
        let shouldAdvancePointer = false;

        if (!membership.lastReadMessageId) {
          shouldAdvancePointer = true;
        } else {
          const currentLastRead = await em.findOne(Message, {
            where: { id: membership.lastReadMessageId },
            select: ["id", "createdAt"],
          });

          shouldAdvancePointer =
            !currentLastRead ||
            newestRead.createdAt > currentLastRead.createdAt;
        }

        if (shouldAdvancePointer) {
          membership.lastReadMessageId = newestRead.id;
        }

        // Декрементируем на количество реально прочитанных, не сбрасываем в 0.
        // foreignIds.length — только чужие сообщения, которые мы пометили как read.
        membership.unreadCount = Math.max(
          0,
          membership.unreadCount - foreignIds.length,
        );
        await em.save(membership);
      }
    });

    this._eventBus.emit(new MessageReadEvent(chatId, userId, foreignIds));
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const isMember = await this._chatService.isMember(message.chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

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
      throw new NotFoundException("Сообщение не найдено");
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
    limit?: number,
    offset?: number,
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const [messages, totalCount] = await this._messageRepo.searchInChat(
      chatId,
      userId,
      query,
      limit ?? 20,
      offset ?? 0,
    );

    const dtos = messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return {
      data: dtos,
      totalCount,
    };
  }

  async searchGlobalMessages(
    userId: string,
    query: string,
    limit?: number,
    offset?: number,
  ) {
    // Get all chats where user is a member
    const memberships = await this._memberRepo.find({
      where: { userId },
      select: ["chatId"],
    });

    const chatIds = memberships.map(m => m.chatId);

    if (chatIds.length === 0) {
      return { data: [], totalCount: 0 };
    }

    const [messages, totalCount] = await this._messageRepo.searchGlobal(
      chatIds,
      userId,
      query,
      limit ?? 20,
      offset ?? 0,
    );

    const dtos = messages.map(MessageDto.fromEntity);

    await this._enrichWithPolls(dtos, userId);

    return {
      data: dtos,
      totalCount,
    };
  }

  async getChatMedia(
    chatId: string,
    userId: string,
    type?: string,
    limit?: number,
    offset?: number,
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const [messages, totalCount] = await this._messageRepo.findMediaByChatId(
      chatId,
      userId,
      type,
      limit ?? 50,
      offset ?? 0,
    );

    return {
      data: messages.map(MediaItemDto.fromEntity),
      totalCount,
    };
  }

  async getChatMediaStats(
    chatId: string,
    userId: string,
  ): Promise<IMediaStatsDto> {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

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
      select: ["id", "chatId", "senderId"],
    });

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const isMember = await this._chatService.isMember(message.chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const receipts = await this._receiptRepo.findByMessageId(messageId);

    return receipts.map(r => ({
      userId: r.userId,
      status: r.status,
      updatedAt: r.updatedAt,
      user: r.user
        ? {
            id: r.user.id,
            firstName: r.user.profile?.firstName,
            lastName: r.user.profile?.lastName,
            avatarUrl: r.user.profile?.avatar?.url,
          }
        : undefined,
    }));
  }

  /** Эмиссия событий после отправки сообщения (fire-and-forget). */
  private async _emitSendMessageEvents(
    chatId: string,
    message: Message,
    mentionedUserIds: string[],
    mentionAll: boolean,
    localId?: string,
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
      select: ["id", "type", "lastMessageId"],
    });

    if (!chat || chat.lastMessageId !== deletedMessageId) return false;

    // Find previous non-deleted message
    const prev = await this._messageRepo.findOne({
      where: { chatId, isDeleted: false },
      order: { createdAt: "DESC" },
      relations: { sender: { profile: true } },
    });

    if (prev) {
      await this._chatRepo.update(chatId, {
        lastMessageId: prev.id,
        lastMessageContent: (prev.content ?? "").slice(0, 200) || null,
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
