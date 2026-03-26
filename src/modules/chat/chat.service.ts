import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import crypto from "crypto";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatRepository } from "./chat.repository";
import { EChatMemberRole, EChatType } from "./chat.types";
import { ChatFolderRepository } from "./chat-folder.repository";
import { ChatInviteRepository } from "./chat-invite.repository";
import { ChatMemberRepository } from "./chat-member.repository";
import { ChatDto, ChatFolderDto, ChatInviteDto } from "./dto";
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
    @inject(ChatInviteRepository)
    private _inviteRepo: ChatInviteRepository,
    @inject(ChatFolderRepository)
    private _folderRepo: ChatFolderRepository,
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

    if (chat.type !== EChatType.GROUP && chat.type !== EChatType.CHANNEL) {
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
      (chat.type === EChatType.GROUP || chat.type === EChatType.CHANNEL) &&
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

  async createChannel(
    userId: string,
    data: {
      name: string;
      description?: string;
      username?: string;
      avatarId?: string;
      isPublic?: boolean;
    },
  ) {
    if (data.username) {
      const existing = await this._chatRepo.findByUsername(data.username);

      if (existing) {
        throw new BadRequestException("Этот username уже занят");
      }
    }

    const chat = await this._chatRepo.createAndSave({
      type: EChatType.CHANNEL,
      name: data.name,
      description: data.description ?? null,
      username: data.username ?? null,
      avatarId: data.avatarId ?? null,
      isPublic: data.isPublic ?? false,
      createdById: userId,
    });

    await this._memberRepo.createAndSave({
      chatId: chat.id,
      userId,
      role: EChatMemberRole.OWNER,
    });

    const fullChat = await this._chatRepo.findById(chat.id);

    this._eventBus.emit(new ChatCreatedEvent(fullChat!, [userId]));

    return ChatDto.fromEntity(fullChat!);
  }

  async updateChannel(
    chatId: string,
    userId: string,
    data: {
      name?: string;
      description?: string | null;
      username?: string | null;
      avatarId?: string | null;
      isPublic?: boolean;
    },
  ) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) throw new NotFoundException("Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw new BadRequestException("Это не канал");
    }

    await this.assertAdminOrOwner(chatId, userId);

    if (data.username !== undefined && data.username !== chat.username) {
      if (data.username) {
        const existing = await this._chatRepo.findByUsername(data.username);

        if (existing && existing.id !== chatId) {
          throw new BadRequestException("Этот username уже занят");
        }
      }
      chat.username = data.username;
    }

    if (data.name !== undefined) chat.name = data.name;
    if (data.description !== undefined) chat.description = data.description;
    if (data.avatarId !== undefined) chat.avatarId = data.avatarId;
    if (data.isPublic !== undefined) chat.isPublic = data.isPublic;

    await this._chatRepo.save(chat);

    const updated = await this._chatRepo.findById(chatId);

    this._eventBus.emit(new ChatUpdatedEvent(updated!));

    return ChatDto.fromEntity(updated!);
  }

  async subscribeToChannel(chatId: string, userId: string) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) throw new NotFoundException("Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw new BadRequestException("Это не канал");
    }
    if (!chat.isPublic) {
      throw new ForbiddenException("Канал не является публичным");
    }

    const existing = await this._memberRepo.findMembership(chatId, userId);

    if (existing) return ChatDto.fromEntity(chat);

    await this._memberRepo.createAndSave({
      chatId,
      userId,
      role: EChatMemberRole.SUBSCRIBER,
    });

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    this._eventBus.emit(
      new ChatMemberJoinedEvent(chatId, userId, memberUserIds),
    );

    const fullChat = await this._chatRepo.findById(chatId);

    return ChatDto.fromEntity(fullChat!);
  }

  async unsubscribeFromChannel(chatId: string, userId: string) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) throw new NotFoundException("Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw new BadRequestException("Это не канал");
    }

    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new BadRequestException("Вы не подписаны на этот канал");
    }

    if (membership.role === EChatMemberRole.OWNER) {
      throw new BadRequestException("Владелец не может отписаться от канала");
    }

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    await this._memberRepo.delete({ id: membership.id });

    this._eventBus.emit(
      new ChatMemberLeftEvent(chatId, userId, memberUserIds),
    );

    return chatId;
  }

  async getPublicChannels(query?: string, offset?: number, limit?: number) {
    return this._chatRepo.findPublicChannels(query, offset, limit);
  }

  async createSecretChat(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("Нельзя создать чат с самим собой");
    }

    const chat = await this._chatRepo.createAndSave({
      type: EChatType.SECRET,
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

  async canSendMessage(chatId: string, userId: string): Promise<boolean> {
    const chat = await this._chatRepo.findOne({
      where: { id: chatId },
      select: ["id", "type"],
    });

    if (!chat) return false;

    if (chat.type === EChatType.CHANNEL) {
      const membership = await this._memberRepo.findMembership(
        chatId,
        userId,
      );

      return (
        !!membership &&
        (membership.role === EChatMemberRole.OWNER ||
          membership.role === EChatMemberRole.ADMIN)
      );
    }

    return this.isMember(chatId, userId);
  }

  async createInviteLink(
    chatId: string,
    userId: string,
    opts?: { expiresAt?: string; maxUses?: number },
  ) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundException("Чат не найден");
    }

    if (chat.type !== EChatType.GROUP && chat.type !== EChatType.CHANNEL) {
      throw new BadRequestException(
        "Invite-ссылки доступны только для групповых чатов и каналов",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    const code = crypto.randomBytes(16).toString("hex");

    const invite = await this._inviteRepo.createAndSave({
      chatId,
      code,
      createdById: userId,
      expiresAt: opts?.expiresAt ? new Date(opts.expiresAt) : null,
      maxUses: opts?.maxUses ?? null,
    });

    return ChatInviteDto.fromEntity(invite);
  }

  async joinByInvite(code: string, userId: string) {
    const invite = await this._inviteRepo.findByCode(code);

    if (!invite || !invite.isActive) {
      throw new NotFoundException("Приглашение не найдено или неактивно");
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException("Приглашение истекло");
    }

    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      throw new BadRequestException(
        "Лимит использований приглашения исчерпан",
      );
    }

    // Check if already a member
    const existing = await this._memberRepo.findMembership(
      invite.chatId,
      userId,
    );

    if (existing) {
      const chat = await this._chatRepo.findById(invite.chatId);

      return ChatDto.fromEntity(chat!);
    }

    await this._memberRepo.createAndSave({
      chatId: invite.chatId,
      userId,
      role: EChatMemberRole.MEMBER,
    });

    invite.useCount += 1;
    await this._inviteRepo.save(invite);

    const memberUserIds = await this._memberRepo.getMemberUserIds(
      invite.chatId,
    );

    this._eventBus.emit(
      new ChatMemberJoinedEvent(invite.chatId, userId, memberUserIds),
    );

    const chat = await this._chatRepo.findById(invite.chatId);

    return ChatDto.fromEntity(chat!);
  }

  async revokeInvite(chatId: string, inviteId: string, userId: string) {
    await this.assertAdminOrOwner(chatId, userId);

    const invite = await this._inviteRepo.findOne({
      where: { id: inviteId, chatId },
    });

    if (!invite) {
      throw new NotFoundException("Приглашение не найдено");
    }

    invite.isActive = false;
    await this._inviteRepo.save(invite);
  }

  async getInvites(chatId: string, userId: string) {
    await this.assertAdminOrOwner(chatId, userId);

    const invites = await this._inviteRepo.findByChatId(chatId);

    return invites.map(ChatInviteDto.fromEntity);
  }

  async muteChat(chatId: string, userId: string, mutedUntil: Date | null) {
    const membership = await this.assertMembership(chatId, userId);

    membership.mutedUntil = mutedUntil;
    await this._memberRepo.save(membership);

    return membership;
  }

  async pinChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isPinnedChat = true;
    membership.pinnedChatAt = new Date();
    await this._memberRepo.save(membership);

    return membership;
  }

  async unpinChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isPinnedChat = false;
    membership.pinnedChatAt = null;
    await this._memberRepo.save(membership);

    return membership;
  }

  async archiveChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isArchived = true;
    await this._memberRepo.save(membership);

    return membership;
  }

  async unarchiveChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isArchived = false;
    await this._memberRepo.save(membership);

    return membership;
  }

  async createFolder(userId: string, name: string) {
    const existing = await this._folderRepo.findOne({
      where: { userId, name },
    });

    if (existing) {
      throw new BadRequestException("Папка с таким названием уже существует");
    }

    const folder = await this._folderRepo.createAndSave({
      userId,
      name,
    });

    return ChatFolderDto.fromEntity(folder);
  }

  async updateFolder(
    userId: string,
    folderId: string,
    data: { name?: string; position?: number },
  ) {
    const folder = await this._folderRepo.findOne({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundException("Папка не найдена");
    }

    if (data.name !== undefined) folder.name = data.name;
    if (data.position !== undefined) folder.position = data.position;

    await this._folderRepo.save(folder);

    return ChatFolderDto.fromEntity(folder);
  }

  async deleteFolder(userId: string, folderId: string) {
    const folder = await this._folderRepo.findOne({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundException("Папка не найдена");
    }

    // Unset folderId for all chat members in this folder
    await this._memberRepo
      .createQueryBuilder()
      .update()
      .set({ folderId: null as unknown as string })
      .where("userId = :userId", { userId })
      .andWhere("folderId = :folderId", { folderId })
      .execute();

    await this._folderRepo.delete({ id: folderId });
  }

  async getUserFolders(userId: string) {
    const folders = await this._folderRepo.findByUser(userId);

    return folders.map(ChatFolderDto.fromEntity);
  }

  async moveChatToFolder(
    chatId: string,
    userId: string,
    folderId: string | null,
  ) {
    const membership = await this.assertMembership(chatId, userId);

    if (folderId) {
      const folder = await this._folderRepo.findOne({
        where: { id: folderId, userId },
      });

      if (!folder) {
        throw new NotFoundException("Папка не найдена");
      }
    }

    membership.folderId = folderId;
    await this._memberRepo.save(membership);

    return membership;
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
