import crypto from "crypto";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { UserBlockService } from "../contact";
import { FileUrlService } from "../file";
import { Chat } from "./chat.entity";
import { ChatError } from "./chat.errors";
import { buildDirectKey, ChatRepository } from "./chat.repository";
import { EChatMemberRole, EChatType } from "./chat.types";
import { ChatBanRepository } from "./chat-ban.repository";
import { ChatFolderRepository } from "./chat-folder.repository";
import { ChatInviteRepository } from "./chat-invite.repository";
import { ChatMember } from "./chat-member.entity";
import { ChatMemberRepository } from "./chat-member.repository";
import {
  ChatDto,
  ChatFolderDto,
  ChatInviteDto,
  ChatMemberDto,
  ChatMemberPublicDto,
  collectChatFiles,
  collectChatMemberFiles,
} from "./dto";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatFolderChangedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatMemberRoleChangedEvent,
  ChatMovedToFolderEvent,
  ChatMutedEvent,
  ChatPinnedEvent,
  ChatUpdatedEvent,
} from "./events";

/** Минимальная длина поискового запроса по каналам. */
const MIN_SEARCH_LENGTH = 2;

/** Сколько папок может завести пользователь: список папок отдаётся целиком. */
export const MAX_CHAT_FOLDERS = 20;

/** Роли, которые владелец может назначить сменой роли, по типу чата. */
const ASSIGNABLE_ROLES: Partial<Record<EChatType, EChatMemberRole[]>> = {
  [EChatType.GROUP]: [EChatMemberRole.ADMIN, EChatMemberRole.MEMBER],
  [EChatType.CHANNEL]: [EChatMemberRole.ADMIN, EChatMemberRole.SUBSCRIBER],
};

/** Роль рядового участника по типу чата. */
const baseRoleFor = (type: EChatType) =>
  type === EChatType.CHANNEL
    ? EChatMemberRole.SUBSCRIBER
    : EChatMemberRole.MEMBER;

const isMultiUserChat = (type: EChatType) =>
  type === EChatType.GROUP || type === EChatType.CHANNEL;

/** Владелец модерирует всех, кроме владельца; админ — только MEMBER/SUBSCRIBER. */
export const canModerateMember = (
  actorRole: EChatMemberRole,
  targetRole: EChatMemberRole,
) => {
  if (targetRole === EChatMemberRole.OWNER) return false;
  if (actorRole === EChatMemberRole.OWNER) return true;

  return (
    actorRole === EChatMemberRole.ADMIN &&
    (targetRole === EChatMemberRole.MEMBER ||
      targetRole === EChatMemberRole.SUBSCRIBER)
  );
};

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
    @inject(DataSource) private _dataSource: DataSource,
    @inject(ChatBanRepository) private _banRepo: ChatBanRepository,
    @inject(UserBlockService) private _userBlock: UserBlockService,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
  ) {}

  async createDirectChat(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw ChatError.SELF_CHAT();
    }

    await this.assertUsersExist([targetUserId]);
    await this.assertNotBlocked(userId, [targetUserId]);

    const existing = await this._chatRepo.findDirectChat(userId, targetUserId);

    if (existing) {
      await this._memberRepo.unhideMembership(existing.id, userId);

      return this.getChatDto(existing.id, userId);
    }

    const createdId = await this._dataSource.transaction(async manager => {
      const id = await this._chatRepo.insertDirectChat(
        buildDirectKey(userId, targetUserId),
        userId,
        manager,
      );

      if (id) {
        await this._memberRepo.insertIgnore(
          [
            { chatId: id, userId, role: EChatMemberRole.MEMBER },
            { chatId: id, userId: targetUserId, role: EChatMemberRole.MEMBER },
          ],
          manager,
        );
      }

      return id;
    });

    if (!createdId) {
      // Чат пары создан параллельным запросом (ON CONFLICT DO NOTHING).
      const raced = await this._chatRepo.findDirectChat(userId, targetUserId);

      if (!raced) throw ChatError.NOT_FOUND();

      return this.getChatDto(raced.id, userId);
    }

    const fullChat = await this.requireFullChat(createdId);

    this._eventBus.emit(new ChatCreatedEvent(fullChat, [userId, targetUserId]));

    return this.toFullChatDto(fullChat, userId);
  }

  async createGroupChat(
    userId: string,
    name: string,
    memberIds: string[],
    avatarId?: string,
  ) {
    const uniqueMembers = [...new Set(memberIds.filter(id => id !== userId))];

    await this.assertUsersExist(uniqueMembers);
    await this.assertNotBlocked(userId, uniqueMembers);

    const chatId = await this._dataSource.transaction(async manager => {
      const chatRepo = manager.getRepository(Chat);
      const savedChat = await chatRepo.save(
        chatRepo.create({
          type: EChatType.GROUP,
          name,
          avatarId: avatarId ?? null,
          createdById: userId,
        }),
      );

      await this._memberRepo.insertIgnore(
        [
          { chatId: savedChat.id, userId, role: EChatMemberRole.OWNER },
          ...uniqueMembers.map(memberId => ({
            chatId: savedChat.id,
            userId: memberId,
            role: EChatMemberRole.MEMBER,
          })),
        ],
        manager,
      );

      return savedChat.id;
    });

    const fullChat = await this.requireFullChat(chatId);

    this._eventBus.emit(
      new ChatCreatedEvent(fullChat, [userId, ...uniqueMembers]),
    );

    return this.toFullChatDto(fullChat, userId);
  }

  async getChatById(chatId: string, userId: string) {
    await this.assertMembership(chatId, userId);

    return this.getChatDto(chatId, userId);
  }

  /** Список чатов пользователя: своё членство, превью участников и их число. */
  async getUserChats(
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<ChatDto>> {
    const page = normalizePagination(offset, limit);
    const [chats, total] = await this._chatRepo.findUserChats(
      userId,
      page.offset,
      page.limit,
    );

    return toPage(await this.toChatDtos(chats, userId), total, page);
  }

  /** Постраничный список участников (только публичные поля). */
  async getChatMembers(
    chatId: string,
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<ChatMemberPublicDto>> {
    await this.assertMembership(chatId, userId);

    const page = normalizePagination(offset, limit);
    const [members, total] = await this._memberRepo.findChatMembersPaged(
      chatId,
      page.offset,
      page.limit,
    );

    return toPage(await this.toMemberPublicDtos(members), total, page);
  }

  async updateChat(
    chatId: string,
    userId: string,
    data: { name?: string; avatarId?: string | null },
  ) {
    const chat = await this.requireChat(chatId);

    if (!isMultiUserChat(chat.type)) {
      throw ChatError.DIRECT_NOT_SUPPORTED(
        undefined,
        "Нельзя редактировать личный чат",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    if (data.name !== undefined) chat.name = data.name;
    if (data.avatarId !== undefined) chat.avatarId = data.avatarId;

    await this._chatRepo.save(chat);

    const updated = await this.requireFullChat(chatId);

    this._eventBus.emit(new ChatUpdatedEvent(updated));

    return this.getChatDto(chatId, userId);
  }

  /**
   * Выход из чата. Direct — скрытие (история и членство сохраняются).
   * Владелец группы/канала уходит только после передачи прав (409); если он
   * единственный участник — чат удаляется.
   */
  async leaveChat(chatId: string, userId: string): Promise<void> {
    const membership = await this.assertMembership(chatId, userId);
    const chat = await this.requireChat(chatId);

    if (chat.type === EChatType.DIRECT) {
      await this._memberRepo.hideMembership(chatId, userId);

      return;
    }

    if (membership.role === EChatMemberRole.OWNER) {
      const memberCount = await this._memberRepo.countMembers(chatId);

      if (memberCount > 1) {
        throw ChatError.OWNER_MUST_TRANSFER();
      }

      await this.removeChat(chatId, [userId], userId);

      return;
    }

    await this.removeMembership(chatId, membership);
  }

  /** Удаление группы/канала владельцем. */
  async deleteChat(chatId: string, userId: string): Promise<void> {
    const chat = await this.requireChat(chatId);

    if (!isMultiUserChat(chat.type)) {
      throw ChatError.DIRECT_NOT_SUPPORTED(
        undefined,
        "Личный чат нельзя удалить — только скрыть",
      );
    }

    await this.assertOwner(chatId, userId);

    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    await this.removeChat(chatId, memberUserIds, userId);
  }

  /** Добавление участников в группу. Возвращает только добавленных. */
  async addMembers(chatId: string, userId: string, memberIds: string[]) {
    const chat = await this.requireChat(chatId);

    if (chat.type !== EChatType.GROUP) {
      throw ChatError.NOT_GROUP();
    }

    await this.assertAdminOrOwner(chatId, userId);

    const existingMemberIds = await this._memberRepo.getMemberUserIds(chatId);
    const candidateIds = [...new Set(memberIds)].filter(
      id => !existingMemberIds.includes(id),
    );

    await this.assertUsersExist(candidateIds);

    const bannedIds = await this._banRepo.findActiveBannedUserIds(
      chatId,
      candidateIds,
    );

    if (bannedIds.length > 0) {
      throw ChatError.USER_BANNED({ userIds: bannedIds });
    }

    await this.assertNotBlocked(userId, candidateIds);

    const insertedIds = await this._memberRepo.insertIgnore(
      candidateIds.map(memberId => ({
        chatId,
        userId: memberId,
        role: EChatMemberRole.MEMBER,
      })),
    );

    const added = await this._memberRepo.findMembershipsWithProfile(
      chatId,
      insertedIds,
    );
    const allMemberIds = [...existingMemberIds, ...insertedIds];

    for (const memberId of insertedIds) {
      this._eventBus.emit(
        new ChatMemberJoinedEvent(
          chatId,
          memberId,
          allMemberIds,
          added.find(m => m.userId === memberId),
        ),
      );
    }

    return added;
  }

  /** Удаление участника: владелец — любого, кроме себя; админ — только MEMBER/SUBSCRIBER. */
  async removeMember(
    chatId: string,
    userId: string,
    targetUserId: string,
  ): Promise<void> {
    const chat = await this.requireChat(chatId);

    if (!isMultiUserChat(chat.type)) {
      throw ChatError.DIRECT_NOT_SUPPORTED(
        undefined,
        "Нельзя удалять участников из личного чата",
      );
    }

    if (userId === targetUserId) {
      throw ChatError.SELF_REMOVE();
    }

    const actor = await this.assertAdminOrOwner(chatId, userId);
    const target = await this._memberRepo.findMembership(chatId, targetUserId);

    if (!target) {
      throw ChatError.MEMBER_NOT_FOUND();
    }

    if (!canModerateMember(actor.role, target.role)) {
      throw ChatError.CANNOT_MODERATE(
        undefined,
        "Недостаточно прав для удаления участника",
      );
    }

    await this.removeMembership(chatId, target);
  }

  async updateMemberRole(
    chatId: string,
    userId: string,
    targetUserId: string,
    role: EChatMemberRole,
  ) {
    if (userId === targetUserId) {
      throw ChatError.SELF_ROLE_CHANGE();
    }

    if (role === EChatMemberRole.OWNER) {
      throw ChatError.OWNER_ROLE_VIA_TRANSFER();
    }

    const chat = await this.requireChat(chatId);

    await this.assertOwner(chatId, userId);

    if (!ASSIGNABLE_ROLES[chat.type]?.includes(role)) {
      throw ChatError.ROLE_NOT_ALLOWED();
    }

    const target = await this._memberRepo.findMembership(chatId, targetUserId);

    if (!target) {
      throw ChatError.MEMBER_NOT_FOUND();
    }

    if (target.role === EChatMemberRole.OWNER) {
      throw ChatError.OWNER_ROLE_IMMUTABLE();
    }

    target.role = role;
    await this._memberRepo.save(target);

    this._eventBus.emit(
      new ChatMemberRoleChangedEvent(chatId, targetUserId, role, userId),
    );

    return target;
  }

  /** Передача владения: текущий владелец → ADMIN, новый → OWNER (атомарно). */
  async transferOwnership(
    chatId: string,
    userId: string,
    newOwnerId: string,
  ): Promise<void> {
    if (userId === newOwnerId) {
      throw ChatError.ALREADY_OWNER();
    }

    const chat = await this.requireChat(chatId);

    if (!isMultiUserChat(chat.type)) {
      throw ChatError.DIRECT_NOT_SUPPORTED(
        undefined,
        "У личного чата нет владельца",
      );
    }

    await this.assertOwner(chatId, userId);

    const target = await this._memberRepo.findMembership(chatId, newOwnerId);

    if (!target) {
      throw ChatError.MEMBER_NOT_FOUND();
    }

    await this._dataSource.transaction(async manager => {
      await this._memberRepo.setRole(
        chatId,
        userId,
        EChatMemberRole.ADMIN,
        manager,
      );
      await this._memberRepo.setRole(
        chatId,
        newOwnerId,
        EChatMemberRole.OWNER,
        manager,
      );
    });

    this._eventBus.emit(
      new ChatMemberRoleChangedEvent(
        chatId,
        userId,
        EChatMemberRole.ADMIN,
        userId,
      ),
    );
    this._eventBus.emit(
      new ChatMemberRoleChangedEvent(
        chatId,
        newOwnerId,
        EChatMemberRole.OWNER,
        userId,
      ),
    );
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
        throw ChatError.USERNAME_TAKEN();
      }
    }

    const chatId = await this._dataSource.transaction(async manager => {
      const chatRepo = manager.getRepository(Chat);
      const savedChat = await chatRepo.save(
        chatRepo.create({
          type: EChatType.CHANNEL,
          name: data.name,
          description: data.description ?? null,
          username: data.username ?? null,
          avatarId: data.avatarId ?? null,
          isPublic: data.isPublic ?? false,
          createdById: userId,
        }),
      );

      await this._memberRepo.insertIgnore(
        [{ chatId: savedChat.id, userId, role: EChatMemberRole.OWNER }],
        manager,
      );

      return savedChat.id;
    });

    const fullChat = await this.requireFullChat(chatId);

    this._eventBus.emit(new ChatCreatedEvent(fullChat, [userId]));

    return this.toFullChatDto(fullChat, userId);
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
    const chat = await this._chatRepo.findByIdLight(chatId);

    if (!chat) throw ChatError.NOT_FOUND(undefined, "Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw ChatError.NOT_CHANNEL();
    }

    await this.assertAdminOrOwner(chatId, userId);

    if (data.username !== undefined && data.username !== chat.username) {
      if (data.username) {
        const existing = await this._chatRepo.findByUsername(data.username);

        if (existing && existing.id !== chatId) {
          throw ChatError.USERNAME_TAKEN();
        }
      }
      chat.username = data.username;
    }

    if (data.name !== undefined) chat.name = data.name;
    if (data.description !== undefined) chat.description = data.description;
    if (data.avatarId !== undefined) chat.avatarId = data.avatarId;
    if (data.isPublic !== undefined) chat.isPublic = data.isPublic;

    await this._chatRepo.save(chat);

    const updated = await this.requireFullChat(chatId);

    this._eventBus.emit(new ChatUpdatedEvent(updated));

    return this.getChatDto(chatId, userId);
  }

  async subscribeToChannel(chatId: string, userId: string) {
    const chat = await this._chatRepo.findByIdLight(chatId);

    if (!chat) throw ChatError.NOT_FOUND(undefined, "Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw ChatError.NOT_CHANNEL();
    }
    if (!chat.isPublic) {
      throw ChatError.CHANNEL_PRIVATE();
    }

    const existing = await this._memberRepo.findMembership(chatId, userId);

    if (existing) {
      return this.getChatDto(chatId, userId);
    }

    await this.assertNotBanned(chatId, userId);

    const inserted = await this._memberRepo.insertIgnore([
      { chatId, userId, role: EChatMemberRole.SUBSCRIBER },
    ]);

    if (inserted.length > 0) {
      await this.emitJoined(chatId, userId);
    }

    return this.getChatDto(chatId, userId);
  }

  async unsubscribeFromChannel(chatId: string, userId: string): Promise<void> {
    const chat = await this._chatRepo.findByIdLight(chatId);

    if (!chat) throw ChatError.NOT_FOUND(undefined, "Канал не найден");
    if (chat.type !== EChatType.CHANNEL) {
      throw ChatError.NOT_CHANNEL();
    }

    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw ChatError.NOT_SUBSCRIBED();
    }

    if (membership.role === EChatMemberRole.OWNER) {
      throw ChatError.OWNER_MUST_TRANSFER(
        undefined,
        "Владелец не может отписаться: передайте права или удалите канал",
      );
    }

    await this.removeMembership(chatId, membership);
  }

  async getPublicChannels(
    query?: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<ChatDto>> {
    const q = query?.trim();

    if (q && q.length < MIN_SEARCH_LENGTH) {
      throw ChatError.SEARCH_QUERY_TOO_SHORT(
        { minLength: MIN_SEARCH_LENGTH },
        `Поисковый запрос — минимум ${MIN_SEARCH_LENGTH} символа`,
      );
    }

    const page = normalizePagination(offset, limit);
    const [chats, total] = await this._chatRepo.findPublicChannels(
      q || undefined,
      page.offset,
      page.limit,
    );

    const dtos = await this._fileUrls.buildWithFiles(
      chats,
      collectChatFiles,
      (chat, files) => ChatDto.fromEntity(chat, files),
    );

    return toPage(dtos, total, page);
  }

  async canSendMessage(chatId: string, userId: string): Promise<boolean> {
    const chat = await this._chatRepo.findOne({
      where: { id: chatId },
      select: { id: true, type: true },
    });

    if (!chat) return false;

    if (chat.type === EChatType.CHANNEL) {
      const membership = await this._memberRepo.findMembership(chatId, userId);

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
    const chat = await this.requireChat(chatId);

    if (!isMultiUserChat(chat.type)) {
      throw ChatError.DIRECT_NOT_SUPPORTED(
        undefined,
        "Invite-ссылки доступны только для групповых чатов и каналов",
      );
    }

    await this.assertAdminOrOwner(chatId, userId);

    const expiresAt = opts?.expiresAt ? new Date(opts.expiresAt) : null;

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw ChatError.INVITE_INVALID_EXPIRY();
    }

    const invite = await this._inviteRepo.createAndSave({
      chatId,
      code: crypto.randomBytes(16).toString("hex"),
      createdById: userId,
      expiresAt,
      maxUses: opts?.maxUses ?? null,
    });

    return ChatInviteDto.fromEntity(invite);
  }

  async joinByInvite(code: string, userId: string) {
    const invite = await this._inviteRepo.findByCode(code);

    if (!invite || !invite.isActive) {
      throw ChatError.INVITE_NOT_FOUND();
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw ChatError.INVITE_EXPIRED();
    }

    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      throw ChatError.INVITE_EXHAUSTED();
    }

    const chatId = invite.chatId;
    const existing = await this._memberRepo.findMembership(chatId, userId);

    if (existing) {
      return this.getChatDto(chatId, userId);
    }

    await this.assertNotBanned(chatId, userId);

    const chat = await this.requireChat(chatId);

    const joined = await this._dataSource.transaction(async manager => {
      const inserted = await this._memberRepo.insertIgnore(
        [{ chatId, userId, role: baseRoleFor(chat.type) }],
        manager,
      );

      if (inserted.length === 0) return false;

      const consumed = await this._inviteRepo.consumeUse(invite.id, manager);

      if (!consumed) {
        // Исключение откатывает вставку членства.
        throw ChatError.INVITE_EXHAUSTED(
          undefined,
          "Приглашение истекло или лимит использований исчерпан",
        );
      }

      return true;
    });

    if (joined) {
      await this.emitJoined(chatId, userId);
    }

    return this.getChatDto(chatId, userId);
  }

  async revokeInvite(
    chatId: string,
    inviteId: string,
    userId: string,
  ): Promise<void> {
    await this.assertAdminOrOwner(chatId, userId);

    const invite = await this._inviteRepo.findOne({
      where: { id: inviteId, chatId },
    });

    if (!invite) {
      throw ChatError.INVITE_NOT_FOUND(undefined, "Приглашение не найдено");
    }

    invite.isActive = false;
    await this._inviteRepo.save(invite);
  }

  async getInvites(
    chatId: string,
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<ChatInviteDto>> {
    await this.assertAdminOrOwner(chatId, userId);

    const page = normalizePagination(offset, limit);
    const [invites, total] = await this._inviteRepo.findByChatId(
      chatId,
      page.offset,
      page.limit,
    );

    return toPage(invites.map(ChatInviteDto.fromEntity), total, page);
  }

  async muteChat(chatId: string, userId: string, mutedUntil: Date | null) {
    const membership = await this.assertMembership(chatId, userId);

    membership.mutedUntil = mutedUntil;
    await this._memberRepo.save(membership);

    this._eventBus.emit(new ChatMutedEvent(chatId, userId, mutedUntil));

    return membership;
  }

  async pinChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isPinnedChat = true;
    membership.pinnedChatAt = new Date();
    await this._memberRepo.save(membership);

    this._eventBus.emit(new ChatPinnedEvent(chatId, userId, true));

    return membership;
  }

  async unpinChat(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    membership.isPinnedChat = false;
    membership.pinnedChatAt = null;
    await this._memberRepo.save(membership);

    this._eventBus.emit(new ChatPinnedEvent(chatId, userId, false));

    return membership;
  }

  async createFolder(userId: string, name: string) {
    const existing = await this._folderRepo.findByUserAndName(userId, name);

    if (existing) {
      throw ChatError.FOLDER_NAME_TAKEN();
    }

    if ((await this._folderRepo.countByUser(userId)) >= MAX_CHAT_FOLDERS) {
      throw ChatError.FOLDER_LIMIT({ max: MAX_CHAT_FOLDERS });
    }

    const folder = await this._folderRepo.createAndSave({ userId, name });
    const dto = ChatFolderDto.fromEntity(folder);

    this._eventBus.emit(
      new ChatFolderChangedEvent(userId, folder.id, "created", dto),
    );

    return dto;
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
      throw ChatError.FOLDER_NOT_FOUND();
    }

    if (data.name !== undefined && data.name !== folder.name) {
      const duplicate = await this._folderRepo.findByUserAndName(
        userId,
        data.name,
      );

      if (duplicate && duplicate.id !== folderId) {
        throw ChatError.FOLDER_NAME_TAKEN();
      }

      folder.name = data.name;
    }

    if (data.position !== undefined) folder.position = data.position;

    await this._folderRepo.save(folder);

    const dto = ChatFolderDto.fromEntity(folder);

    this._eventBus.emit(
      new ChatFolderChangedEvent(userId, folderId, "updated", dto),
    );

    return dto;
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const folder = await this._folderRepo.findOne({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw ChatError.FOLDER_NOT_FOUND();
    }

    await this._memberRepo
      .createQueryBuilder()
      .update()
      .set({ folderId: null })
      .where("userId = :userId", { userId })
      .andWhere("folderId = :folderId", { folderId })
      .execute();

    await this._folderRepo.delete({ id: folderId });

    this._eventBus.emit(
      new ChatFolderChangedEvent(userId, folderId, "deleted", null),
    );
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
        throw ChatError.FOLDER_NOT_FOUND();
      }
    }

    membership.folderId = folderId;
    await this._memberRepo.save(membership);

    this._eventBus.emit(new ChatMovedToFolderEvent(chatId, userId, folderId));

    return membership;
  }

  /**
   * Реакция на удаление пользователя. Группы/каналы, где он владелец,
   * передаются старейшему ADMIN (иначе старейшему участнику) либо удаляются,
   * если других участников нет. Direct-чаты остаются.
   * Затем зачищаются чаты без участников или без владельца: событие может
   * обрабатываться как до, так и после каскадного удаления членств.
   */
  async handleUserDeleted(userId: string): Promise<void> {
    const owned = await this._memberRepo.findOwnedMemberships(userId);

    for (const { chatId } of owned) {
      await this.reassignOwner(chatId, userId);
    }

    for (const chatId of await this._chatRepo.findOrphanChatIds()) {
      await this.removeChat(chatId, [], null);
    }

    for (const chatId of await this._chatRepo.findChatIdsWithoutOwner()) {
      await this.reassignOwner(chatId, null);
    }
  }

  async isMember(chatId: string, userId: string): Promise<boolean> {
    const count = await this._memberRepo.count({
      where: { chatId, userId },
    });

    return count > 0;
  }

  async getMemberUserIds(chatId: string): Promise<string[]> {
    return this._memberRepo.getMemberUserIds(chatId);
  }

  /** Передать владение кандидату; без кандидата — удалить чат. */
  private async reassignOwner(chatId: string, excludeUserId: string | null) {
    const candidate = await this._memberRepo.findOwnershipCandidate(
      chatId,
      excludeUserId,
    );

    if (!candidate) {
      await this.removeChat(chatId, [], null);

      return;
    }

    await this._memberRepo.setRole(
      chatId,
      candidate.userId,
      EChatMemberRole.OWNER,
    );

    this._eventBus.emit(
      new ChatMemberRoleChangedEvent(
        chatId,
        candidate.userId,
        EChatMemberRole.OWNER,
        excludeUserId ?? candidate.userId,
      ),
    );
  }

  private async removeChat(
    chatId: string,
    memberUserIds: string[],
    deletedBy: string | null,
  ) {
    await this._chatRepo.delete({ id: chatId });

    this._eventBus.emit(new ChatDeletedEvent(chatId, memberUserIds, deletedBy));
  }

  private async removeMembership(chatId: string, membership: ChatMember) {
    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);

    await this._memberRepo.delete({ id: membership.id });

    this._eventBus.emit(
      new ChatMemberLeftEvent(chatId, membership.userId, memberUserIds),
    );
  }

  private async emitJoined(chatId: string, userId: string) {
    const memberUserIds = await this._memberRepo.getMemberUserIds(chatId);
    const member = await this._memberRepo.findMembershipWithProfile(
      chatId,
      userId,
    );

    this._eventBus.emit(
      new ChatMemberJoinedEvent(
        chatId,
        userId,
        memberUserIds,
        member ?? undefined,
      ),
    );
  }

  /** ChatDto одного чата: своё членство, превью участников и их число. */
  private async getChatDto(chatId: string, userId: string) {
    const chat = await this.requireChat(chatId);
    const [dto] = await this.toChatDtos([chat], userId);

    return dto;
  }

  /** ChatDto только что созданного чата (участники — из `chat.members`). */
  private async toFullChatDto(chat: Chat, userId: string) {
    return this._fileUrls.buildOneWithFiles(
      chat,
      collectChatFiles,
      (entity, files) => ChatDto.fromEntity(entity, files, userId),
    );
  }

  private async toChatDtos(chats: Chat[], userId: string) {
    const chatIds = chats.map(c => c.id);
    const [preview, counts] = await Promise.all([
      this._memberRepo.findPreviewMembers(chatIds),
      this._memberRepo.countByChatIds(chatIds),
    ]);
    const meByChat = new Map<string, ChatMember | null>();

    for (const chat of chats) {
      const me =
        chat.members?.find(m => m.userId === userId) ??
        (await this._memberRepo.findMembershipWithProfile(chat.id, userId));

      meByChat.set(chat.id, me);
    }

    const files = await this._fileUrls.toDtoMap(
      collectChatFiles(chats, [...preview, ...meByChat.values()]),
    );

    return chats.map(chat => {
      const members = preview.filter(m => m.chatId === chat.id);

      return ChatDto.fromEntity(chat, files, userId, {
        members,
        membersCount: counts[chat.id] ?? members.length,
        me: meByChat.get(chat.id) ?? null,
      });
    });
  }

  /** Публичные DTO участников с подписанными аватарами. */
  toMemberPublicDtos(members: ChatMember[]): Promise<ChatMemberPublicDto[]> {
    return this._fileUrls.buildWithFiles(
      members,
      collectChatMemberFiles,
      ChatMemberPublicDto.fromEntity,
    );
  }

  /** DTO своего членства с подписанным аватаром. */
  toMemberDto(member: ChatMember): Promise<ChatMemberDto> {
    return this._fileUrls.buildOneWithFiles(
      member,
      collectChatMemberFiles,
      ChatMemberDto.fromEntity,
    );
  }

  private async requireChat(chatId: string) {
    const chat = await this._chatRepo.findByIdLight(chatId);

    if (!chat) {
      throw ChatError.NOT_FOUND();
    }

    return chat;
  }

  private async requireFullChat(chatId: string) {
    const chat = await this._chatRepo.findById(chatId);

    if (!chat) {
      throw ChatError.NOT_FOUND();
    }

    return chat;
  }

  private async assertUsersExist(userIds: string[]) {
    if (userIds.length === 0) return;

    const existing = await this._memberRepo.findExistingUserIds(userIds);

    if (existing.length !== new Set(userIds).size) {
      throw ChatError.USER_NOT_FOUND();
    }
  }

  private async assertNotBlocked(userId: string, otherUserIds: string[]) {
    for (const otherId of otherUserIds) {
      if (await this._userBlock.isBlockedEither(userId, otherId)) {
        throw ChatError.USER_BLOCKED();
      }
    }
  }

  private async assertNotBanned(chatId: string, userId: string) {
    const ban = await this._banRepo.findActiveBan(chatId, userId);

    if (ban) {
      throw ChatError.BANNED();
    }
  }

  private async assertMembership(chatId: string, userId: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw ChatError.NOT_MEMBER();
    }

    return membership;
  }

  private async assertAdminOrOwner(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw ChatError.ADMIN_REQUIRED();
    }

    return membership;
  }

  private async assertOwner(chatId: string, userId: string) {
    const membership = await this.assertMembership(chatId, userId);

    if (membership.role !== EChatMemberRole.OWNER) {
      throw ChatError.OWNER_REQUIRED();
    }

    return membership;
  }
}
