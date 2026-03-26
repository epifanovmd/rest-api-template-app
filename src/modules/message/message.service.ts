import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatRepository } from "../chat/chat.repository";
import { ChatService } from "../chat/chat.service";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { MessageDto } from "./dto";
import {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageReadEvent,
  MessageUpdatedEvent,
} from "./events";
import { MessageRepository } from "./message.repository";
import { EMessageType } from "./message.types";
import { MessageAttachmentRepository } from "./message-attachment.repository";

@Injectable()
export class MessageService {
  constructor(
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(MessageAttachmentRepository)
    private _attachmentRepo: MessageAttachmentRepository,
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatService) private _chatService: ChatService,
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
    },
  ) {
    const isMember = await this._chatService.isMember(chatId, senderId);

    if (!isMember) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
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

        // Обновляем lastMessageAt чата
        await em.getRepository("chats").update(
          { id: chatId },
          { lastMessageAt: new Date() },
        );

        return saved;
      },
    );

    const fullMessage = await this._messageRepo.findById(message.id);
    const memberUserIds = await this._chatService.getMemberUserIds(chatId);

    this._eventBus.emit(
      new MessageCreatedEvent(fullMessage!, chatId, memberUserIds),
    );

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

  async markAsRead(chatId: string, userId: string, messageId: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    membership.lastReadMessageId = messageId;
    await this._memberRepo.save(membership);

    this._eventBus.emit(new MessageReadEvent(chatId, userId, messageId));
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
}
