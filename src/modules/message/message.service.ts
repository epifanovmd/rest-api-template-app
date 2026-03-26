import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ChatRepository } from "../chat/chat.repository";
import { ChatService } from "../chat/chat.service";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { LinkPreviewService } from "../link-preview/link-preview.service";
import { IMediaStatsDto, MediaItemDto, MessageDto } from "./dto";
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
import { MessageRepository } from "./message.repository";
import { EMessageStatus, EMessageType } from "./message.types";
import { MessageAttachmentRepository } from "./message-attachment.repository";
import { MessageMentionRepository } from "./message-mention.repository";
import { MessageReactionRepository } from "./message-reaction.repository";

@Injectable()
export class MessageService {
  constructor(
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(MessageAttachmentRepository)
    private _attachmentRepo: MessageAttachmentRepository,
    @inject(MessageReactionRepository)
    private _reactionRepo: MessageReactionRepository,
    @inject(MessageMentionRepository)
    private _mentionRepo: MessageMentionRepository,
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatService) private _chatService: ChatService,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(LinkPreviewService)
    private _linkPreviewService: LinkPreviewService,
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
      encryptedContent?: string;
      encryptionMetadata?: Record<string, unknown>;
      scheduledAt?: string;
      selfDestructSeconds?: number;
    },
  ) {
    const canSend = await this._chatService.canSendMessage(chatId, senderId);

    if (!canSend) {
      throw new ForbiddenException(
        "Вы не можете отправлять сообщения в этот чат",
      );
    }

    const isScheduled = !!data.scheduledAt;

    const message = await this._messageRepo.withTransaction(
      async (repo, em) => {
        const msg = repo.create({
          chatId,
          senderId,
          type: data.type ?? EMessageType.TEXT,
          content: data.content ?? null,
          replyToId: data.replyToId ?? null,
          forwardedFromId: data.forwardedFromId ?? null,
          encryptedContent: data.encryptedContent ?? null,
          encryptionMetadata: data.encryptionMetadata ?? null,
          isScheduled,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          selfDestructSeconds: data.selfDestructSeconds ?? null,
        });

        const saved = await repo.save(msg);

        // Создаём вложения
        if (data.fileIds && data.fileIds.length > 0) {
          const attachmentRepo = em.getRepository("message_attachments");

          for (const fileId of data.fileIds) {
            await attachmentRepo.save({
              messageId: saved.id,
              fileId,
            });
          }
        }

        // Create mentions
        if (data.mentionedUserIds || data.mentionAll) {
          const mentionRepo = em.getRepository("message_mentions");

          if (data.mentionAll) {
            await mentionRepo.save({
              messageId: saved.id,
              userId: null,
              isAll: true,
            });
          }

          if (data.mentionedUserIds) {
            for (const uid of data.mentionedUserIds) {
              await mentionRepo.save({
                messageId: saved.id,
                userId: uid,
                isAll: false,
              });
            }
          }
        }

        // Обновляем lastMessageAt чата
        await em.getRepository("chats").update(
          { id: chatId },
          { lastMessageAt: new Date() },
        );

        return saved;
      },
    );

    const fullMessage = await this._messageRepo.findById(message.id);

    // Don't emit event for scheduled messages
    if (!isScheduled) {
      const memberUserIds = await this._chatService.getMemberUserIds(chatId);

      this._eventBus.emit(
        new MessageCreatedEvent(
          fullMessage!,
          chatId,
          memberUserIds,
          data.mentionedUserIds ?? [],
          data.mentionAll ?? false,
        ),
      );

      // Fetch link previews asynchronously
      if (data.content) {
        this._fetchAndSaveLinkPreviews(message.id, data.content).catch(err => {
          logger.warn({ err }, "Failed to fetch link previews");
        });
      }
    }

    return MessageDto.fromEntity(fullMessage!);
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
      before,
      limit ?? 50,
    );

    return {
      data: messages.map(MessageDto.fromEntity),
      hasMore,
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

    const updated = await this._messageRepo.findById(messageId);

    this._eventBus.emit(
      new MessageUpdatedEvent(updated!, message.chatId),
    );

    return MessageDto.fromEntity(updated!);
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (message.senderId !== userId) {
      // Проверяем, является ли пользователь админом/владельцем чата
      const membership = await this._memberRepo.findMembership(
        message.chatId,
        userId,
      );

      if (!membership || membership.role === "member") {
        throw new ForbiddenException(
          "Недостаточно прав для удаления сообщения",
        );
      }
    }

    // Soft delete
    message.isDeleted = true;
    message.content = null;
    await this._messageRepo.save(message);

    this._eventBus.emit(
      new MessageDeletedEvent(messageId, message.chatId),
    );
  }

  async pinMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    // Check admin/owner
    const membership = await this._memberRepo.findMembership(
      message.chatId,
      userId,
    );

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      throw new ForbiddenException("Недостаточно прав для закрепления");
    }

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedById = userId;
    await this._messageRepo.save(message);

    const updated = await this._messageRepo.findById(messageId);

    this._eventBus.emit(
      new MessagePinnedEvent(updated!, message.chatId, userId),
    );

    return MessageDto.fromEntity(updated!);
  }

  async unpinMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const membership = await this._memberRepo.findMembership(
      message.chatId,
      userId,
    );

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      throw new ForbiddenException("Недостаточно прав для открепления");
    }

    message.isPinned = false;
    message.pinnedAt = null;
    message.pinnedById = null;
    await this._messageRepo.save(message);

    this._eventBus.emit(
      new MessageUnpinnedEvent(messageId, message.chatId),
    );
  }

  async getPinnedMessages(chatId: string, userId: string) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const messages = await this._messageRepo.find({
      where: { chatId, isPinned: true },
      relations: {
        sender: { profile: true },
        replyTo: { sender: { profile: true } },
        attachments: { file: true },
      },
      order: { pinnedAt: "DESC" },
    });

    return messages.map(MessageDto.fromEntity);
  }

  async markAsDelivered(
    chatId: string,
    userId: string,
    messageIds: string[],
  ) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) return;

    await this._messageRepo
      .createQueryBuilder()
      .update()
      .set({ status: EMessageStatus.DELIVERED })
      .where("chatId = :chatId", { chatId })
      .andWhere("id IN (:...messageIds)", { messageIds })
      .andWhere("senderId != :userId", { userId })
      .andWhere("status = :status", { status: EMessageStatus.SENT })
      .execute();

    this._eventBus.emit(
      new MessageDeliveredEvent(messageIds, chatId, userId),
    );
  }

  async markAsRead(chatId: string, userId: string, messageId: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    membership.lastReadMessageId = messageId;
    await this._memberRepo.save(membership);

    // Update status to READ for all messages up to this one
    const readMessage = await this._messageRepo.findOne({
      where: { id: messageId },
      select: ["createdAt"],
    });

    if (readMessage) {
      await this._messageRepo
        .createQueryBuilder()
        .update()
        .set({ status: EMessageStatus.READ })
        .where("chatId = :chatId", { chatId })
        .andWhere("senderId != :userId", { userId })
        .andWhere("createdAt <= :createdAt", {
          createdAt: readMessage.createdAt,
        })
        .andWhere("status != :readStatus", {
          readStatus: EMessageStatus.READ,
        })
        .execute();
    }

    this._eventBus.emit(new MessageReadEvent(chatId, userId, messageId));
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    const isMember = await this._chatService.isMember(
      message.chatId,
      userId,
    );

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
      query,
      limit ?? 20,
      offset ?? 0,
    );

    return {
      data: messages.map(MessageDto.fromEntity),
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
      query,
      limit ?? 20,
      offset ?? 0,
    );

    return {
      data: messages.map(MessageDto.fromEntity),
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

    return this._messageRepo.getMediaStats(chatId);
  }

  async getUnreadCount(chatId: string, userId: string): Promise<number> {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) return 0;

    const qb = this._messageRepo
      .createQueryBuilder("message")
      .where("message.chatId = :chatId", { chatId });

    if (membership.lastReadMessageId) {
      const lastRead = await this._messageRepo.findOne({
        where: { id: membership.lastReadMessageId },
        select: ["createdAt"],
      });

      if (lastRead) {
        qb.andWhere("message.createdAt > :lastReadAt", {
          lastReadAt: lastRead.createdAt,
        });
      }
    }

    return qb.getCount();
  }

  /** Получить запланированные сообщения в чате. */
  async getScheduledMessages(chatId: string, userId: string) {
    const isMember = await this._chatService.isMember(chatId, userId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    const messages = await this._messageRepo.find({
      where: { chatId, senderId: userId, isScheduled: true },
      relations: {
        sender: { profile: true },
        replyTo: { sender: { profile: true } },
        attachments: { file: true },
        reactions: true,
      },
      order: { scheduledAt: "ASC" },
    });

    return messages.map(MessageDto.fromEntity);
  }

  /** Отменить запланированное сообщение. */
  async cancelScheduledMessage(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException(
        "Можно отменять только свои запланированные сообщения",
      );
    }

    if (!message.isScheduled) {
      throw new BadRequestException("Сообщение не является запланированным");
    }

    await this._messageRepo.delete({ id: messageId });
  }

  /** Отметить сообщение как открытое (для самоуничтожения). */
  async markMessageOpened(messageId: string, userId: string) {
    const message = await this._messageRepo.findById(messageId);

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (!message.selfDestructSeconds) {
      throw new BadRequestException(
        "Сообщение не является самоуничтожаемым",
      );
    }

    // Only the recipient (non-sender) can trigger the self-destruct timer
    if (message.senderId === userId) {
      return MessageDto.fromEntity(message);
    }

    if (!message.selfDestructAt) {
      message.selfDestructAt = new Date(
        Date.now() + message.selfDestructSeconds * 1000,
      );
      await this._messageRepo.save(message);
    }

    const updated = await this._messageRepo.findById(messageId);

    return MessageDto.fromEntity(updated!);
  }

  /** Внутренний метод: получить и сохранить link previews для сообщения. */
  private async _fetchAndSaveLinkPreviews(messageId: string, content: string) {
    const previews =
      await this._linkPreviewService.getPreviewsForContent(content);

    if (previews.length > 0) {
      await this._messageRepo.update(messageId, {
        linkPreviews: previews,
      });
    }
  }
}
