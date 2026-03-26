import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatRepository } from "./chat.repository";
import { EChatMemberRole, EChatType } from "./chat.types";
import { ChatMemberRepository } from "./chat-member.repository";
import { ChatDto } from "./dto";
import {
  ChatCreatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatUpdatedEvent,
} from "./events";

@Injectable()
export class ChatService {
  constructor(
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async createDirectChat(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException(
        "Нельзя создать чат с самим собой",
      );
    }

    const existing = await this._chatRepo.findDirectChat(
      userId,
      targetUserId,
    );

    if (existing) {
      const chat = await this._chatRepo.findById(existing.id);

      return ChatDto.fromEntity(chat!);
    }

    const chat = await this._chatRepo.createAndSave({
      type: EChatType.DIRECT,
      name: null,
      createdById: userId,
    });

    await this._memberRepo.createAndSave({
      chatId: chat.id,
      userId,
      role: EChatMemberRole.MEMBER,
    });

    await this._memberRepo.createAndSave({
      chatId: chat.id,
      userId: targetUserId,
      role: EChatMemberRole.MEMBER,
    });

    const fullChat = await this._chatRepo.findById(chat.id);
    const memberUserIds = [userId, targetUserId];

    this._eventBus.emit(new ChatCreatedEvent(fullChat!, memberUserIds));

    return ChatDto.fromEntity(fullChat!);
  }

  async createGroupChat(
    userId: string,
    name: string,
    memberIds: string[],
    avatarId?: string,
  ) {
    const chat = await this._chatRepo.createAndSave({
      type: EChatType.GROUP,
      name,
      avatarId: avatarId ?? null,
      createdById: userId,
    });

    // Создатель — owner
    await this._memberRepo.createAndSave({
      chatId: chat.id,
      userId,
      role: EChatMemberRole.OWNER,
    });

    // Добавляем участников
    const uniqueMembers = [...new Set(memberIds.filter(id => id !== userId))];

    for (const memberId of uniqueMembers) {
      await this._memberRepo.createAndSave({
        chatId: chat.id,
        userId: memberId,
        role: EChatMemberRole.MEMBER,
      });
    }

    const fullChat = await this._chatRepo.findById(chat.id);
    const allMemberIds = [userId, ...uniqueMembers];

    this._eventBus.emit(new ChatCreatedEvent(fullChat!, allMemberIds));

    return ChatDto.fromEntity(fullChat!);
  }

  async getChatById(chatId: string, userId: string) {
    await this.assertMembership(chatId, userId);

    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    return ChatDto.fromEntity(chat);
  }

  async getUserChats(userId: string, offset?: number, limit?: number) {
    return this._chatRepo.findUserChats(userId, offset, limit);
  }

  async updateChat(
    chatId: string,
    userId: string,
    data: { name?: string; avatarId?: string | null },
  ) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    if (chat.type !== EChatType.GROUP) {
      throw new BadRequestException(
        "Нельзя редактировать личный чат",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    if (data.name !== undefined) chat.name = data.name;
    if (data.avatarId !== undefined) chat.avatarId = data.avatarId;

    await this._chatRepo.save(chat);

    const updated = await this._chatRepo.findById(chatId);

    this._eventBus.emit(new ChatUpdatedEvent(updated!));

    return ChatDto.fromEntity(updated!);
  }

  async leaveChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    if (
      chat.type === EChatType.GROUP &&
      membership.role === EChatMemberRole.OWNER
    ) {
      const memberCount = await this._memberRepo.countMembers(chatId);

      if (memberCount > 1) {
        throw new BadRequestException(
          "Передайте права владельца другому участнику перед выходом",
        );
      }

      // Последний участник — удаляем чат
      await this._chatRepo.delete({ id: chatId });

      return chatId;
    }

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    await this._memberRepo.delete({ id: membership.id });

    this._eventBus.emit(new ChatMemberLeftEvent(chatId, userId, memberUserIds));

    return chatId;
  }

  async addMembers(chatId: string, userId: string, memberIds: string[]) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    if (chat.type !== EChatType.GROUP) {
      throw new BadRequestException(
        "Нельзя добавлять участников в личный чат",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    const existingMemberIds = await this._memberRepo.getMemberUserIds(chatId);
    const newMemberIds = memberIds.filter(
      id => !existingMemberIds.includes(id),
    );

    for (const memberId of newMemberIds) {
      await this._memberRepo.createAndSave({
        chatId,
        userId: memberId,
        role: EChatMemberRole.MEMBER,
      });
    }

    const allMemberIds = [
      ...existingMemberIds,
      ...newMemberIds,
    ];

    for (const memberId of newMemberIds) {
      this._eventBus.emit(
        new ChatMemberJoinedEvent(chatId, memberId, allMemberIds),
      );
    }

    const members = await this._memberRepo.findChatMembers(chatId);

    return members;
  }

  async removeMember(chatId: string, userId: string, targetUserId: string) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    if (chat.type !== EChatType.GROUP) {
      throw new BadRequestException(
        "Нельзя удалять участников из личного чата",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    const targetMembership = await this._memberRepo.findMembership(
      chatId,
      targetUserId,
    );

    if (!targetMembership) {
      throw new NotFoundException("Участник не найден");
    }

    if (targetMembership.role === EChatMemberRole.OWNER) {
      throw new ForbiddenException("Нельзя удалить владельца чата");
    }

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    await this._memberRepo.delete({ id: targetMembership.id });

    this._eventBus.emit(
      new ChatMemberLeftEvent(chatId, targetUserId, memberUserIds),
    );

    return targetUserId;
  }

  async updateMemberRole(
    chatId: string,
    userId: string,
    targetUserId: string,
    role: EChatMemberRole,
  ) {
    await this.assertOwner(chatId, userId);

    const targetMembership = await this._memberRepo.findMembership(
      chatId,
      targetUserId,
    );

    if (!targetMembership) {
      throw new NotFoundException("Участник не найден");
    }

    targetMembership.role = role;
    await this._memberRepo.save(targetMembership);

    const members = await this._memberRepo.findChatMembers(chatId);
    const member = members.find(m => m.userId === targetUserId);

    return member!;
  }

  async isMember(chatId: string, userId: string): Promise<boolean> {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    return !!membership;
  }

  async getMemberUserIds(chatId: string): Promise<string[]> {
    return this._memberRepo.getMemberUserIds(chatId);
  }

  private async assertMembership(chatId: string, userId: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    return membership;
  }

  private async assertAdminOrOwner(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw new ForbiddenException("Недостаточно прав");
    }

    return membership;
  }

  private async assertOwner(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    if (membership.role !== EChatMemberRole.OWNER) {
      throw new ForbiddenException("Только владелец чата может выполнить это действие");
    }

    return membership;
  }
}
