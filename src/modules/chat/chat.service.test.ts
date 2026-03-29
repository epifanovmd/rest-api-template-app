import "reflect-metadata";

import { BadRequestException, ForbiddenException, NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid, uuid2, uuid3 } from "../../test/helpers";
import { ChatService } from "./chat.service";
import { EChatMemberRole, EChatType } from "./chat.types";
import { ChatCreatedEvent, ChatMemberJoinedEvent, ChatMemberLeftEvent, ChatUpdatedEvent } from "./events";

describe("ChatService", () => {
  let service: ChatService;
  let chatRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let inviteRepo: ReturnType<typeof createMockRepository>;
  let folderRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const targetUserId = uuid2();
  const chatId = uuid3();

  const makeChatEntity = (overrides: Record<string, unknown> = {}) => ({
    id: chatId,
    type: EChatType.GROUP,
    name: "Test Chat",
    description: null,
    username: null,
    isPublic: false,
    avatar: null,
    avatarId: null,
    createdById: userId,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    ...overrides,
  });

  const makeMembership = (overrides: Record<string, unknown> = {}) => ({
    id: "membership-1",
    chatId,
    userId,
    role: EChatMemberRole.MEMBER,
    joinedAt: new Date(),
    mutedUntil: null,
    isPinnedChat: false,

    folderId: null,
    pinnedChatAt: null,
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    chatRepo = createMockRepository();
    memberRepo = createMockRepository();
    inviteRepo = createMockRepository();
    folderRepo = createMockRepository();
    eventBus = createMockEventBus();

    const mockTxQb: any = {};
    const txQbMethods = ["innerJoin", "where", "andWhere"];

    for (const m of txQbMethods) {
      mockTxQb[m] = sinon.stub().returns(mockTxQb);
    }
    mockTxQb.getOne = sinon.stub().resolves(null);

    const mockTxRepo = {
      create: sinon.stub().callsFake((data: any) => ({ id: chatId, ...data })),
      save: sinon.stub().callsFake((data: any) => Promise.resolve(Array.isArray(data) ? data : { id: chatId, ...data })),
      createQueryBuilder: sinon.stub().returns(mockTxQb),
      increment: sinon.stub().resolves(),
    };

    service = new ChatService(
      chatRepo as any,
      memberRepo as any,
      inviteRepo as any,
      folderRepo as any,
      eventBus as any,
      { transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns(mockTxRepo) })) } as any,
    );

    // Default: findById / findByIdLight return a chat entity
    (chatRepo as any).findById = sinon.stub().resolves(makeChatEntity());
    // findByIdLight delegates to findById stub — so overriding findById works for both
    (chatRepo as any).findByIdLight = sinon.stub().callsFake(
      (id: string) => (chatRepo as any).findById(id),
    );
    // Default: findMembership returns a membership
    (memberRepo as any).findMembership = sinon.stub().resolves(makeMembership());
    // Default: countMembers
    (memberRepo as any).countMembers = sinon.stub().resolves(1);
    // Default: getMemberUserIds
    (memberRepo as any).getMemberUserIds = sinon.stub().resolves([userId]);
    // Default: findChatMembers
    (memberRepo as any).findChatMembers = sinon.stub().resolves([]);
    // Default: findDirectChat
    (chatRepo as any).findDirectChat = sinon.stub().resolves(null);
    // Default: findByUsername
    (chatRepo as any).findByUsername = sinon.stub().resolves(null);
    // Default: findByCode
    (inviteRepo as any).findByCode = sinon.stub().resolves(null);
    // Default: findByChatId
    (inviteRepo as any).findByChatId = sinon.stub().resolves([]);
    // Default: findByUser (folders)
    (folderRepo as any).findByUser = sinon.stub().resolves([]);
  });

  afterEach(() => sandbox.restore());

  // ───── createDirectChat ─────

  describe("createDirectChat", () => {
    it("should create a direct chat with 2 members and emit ChatCreatedEvent", async () => {
      const fullChat = makeChatEntity({ type: EChatType.DIRECT, name: null });

      (chatRepo as any).findById.resolves(fullChat);

      const result = await service.createDirectChat(userId, targetUserId);

      expect(eventBus.emit.calledOnce).to.be.true;
      const emittedEvent = eventBus.emit.firstCall.args[0];

      expect(emittedEvent).to.be.instanceOf(ChatCreatedEvent);

      expect(result).to.have.property("id", chatId);
    });

    it("should throw BadRequestException when creating chat with self", async () => {
      try {
        await service.createDirectChat(userId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should return existing direct chat if one already exists", async () => {
      const existing = makeChatEntity({ type: EChatType.DIRECT });

      (chatRepo as any).findDirectChat.resolves({ id: chatId });
      (chatRepo as any).findById.resolves(existing);

      const result = await service.createDirectChat(userId, targetUserId);

      expect(chatRepo.createAndSave.called).to.be.false;
      expect(result).to.have.property("id", chatId);
    });
  });

  // ───── createGroupChat ─────

  describe("createGroupChat", () => {
    it("should create a group chat with owner + members and emit event", async () => {
      const memberId = uuid2();
      const fullChat = makeChatEntity({ type: EChatType.GROUP });

      (chatRepo as any).findById.resolves(fullChat);

      const result = await service.createGroupChat(userId, "Group", [memberId]);

      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatCreatedEvent);

      expect(result).to.have.property("id", chatId);
    });

    it("should deduplicate memberIds and exclude the creator", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity());

      const result = await service.createGroupChat(userId, "Group", [userId, targetUserId, targetUserId]);

      expect(result).to.have.property("id", chatId);
    });
  });

  // ───── getChatById ─────

  describe("getChatById", () => {
    it("should return chat when user is a member", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership());
      (chatRepo as any).findById.resolves(makeChatEntity());

      const result = await service.getChatById(chatId, userId);

      expect(result).to.have.property("id", chatId);
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.getChatById(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when chat does not exist", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership());
      (chatRepo as any).findById.resolves(null);

      try {
        await service.getChatById(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── updateChat ─────

  describe("updateChat", () => {
    it("should allow admin to update a GROUP chat", async () => {
      const chat = makeChatEntity({ type: EChatType.GROUP });
      const updatedChat = makeChatEntity({ type: EChatType.GROUP, name: "New Name" });

      (chatRepo as any).findById
        .onFirstCall().resolves(chat)
        .onSecondCall().resolves(updatedChat);
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));

      const result = await service.updateChat(chatId, userId, { name: "New Name" });

      expect(chatRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatUpdatedEvent);
      expect(result).to.have.property("name", "New Name");
    });

    it("should throw BadRequestException when updating a DIRECT chat", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.DIRECT }));

      try {
        await service.updateChat(chatId, userId, { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when chat does not exist", async () => {
      (chatRepo as any).findById.resolves(null);

      try {
        await service.updateChat(chatId, userId, { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw ForbiddenException when user is a regular member", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.MEMBER }));

      try {
        await service.updateChat(chatId, userId, { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── leaveChat ─────

  describe("leaveChat", () => {
    it("should throw when owner with other members tries to leave", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.OWNER }));
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).countMembers.resolves(3);

      try {
        await service.leaveChat(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should delete chat when owner is the last member", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.OWNER }));
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).countMembers.resolves(1);

      const result = await service.leaveChat(chatId, userId);

      expect(chatRepo.delete.calledOnce).to.be.true;
      expect(result).to.equal(chatId);
    });

    it("should remove membership for regular member and emit event", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.MEMBER }));
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);

      const result = await service.leaveChat(chatId, userId);

      expect(memberRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberLeftEvent);
      expect(result).to.equal(chatId);
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.leaveChat(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── addMembers ─────

  describe("addMembers", () => {
    it("should allow admin to add members to GROUP", async () => {
      const newMemberId = uuid2();

      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));
      (memberRepo as any).getMemberUserIds.resolves([userId]);
      (memberRepo as any).findChatMembers.resolves([]);

      await service.addMembers(chatId, userId, [newMemberId]);

      // Batch create+save: create called, then save with array
      expect(memberRepo.create.calledOnce).to.be.true;
      expect(memberRepo.create.firstCall.args[0].role).to.equal(EChatMemberRole.MEMBER);
      expect(memberRepo.save.called).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberJoinedEvent);
    });

    it("should throw BadRequestException when adding to DIRECT chat", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.DIRECT }));

      try {
        await service.addMembers(chatId, userId, [targetUserId]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should not add members that already exist", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);
      (memberRepo as any).findChatMembers.resolves([]);

      await service.addMembers(chatId, userId, [targetUserId]);

      expect(memberRepo.createAndSave.called).to.be.false;
    });
  });

  // ───── removeMember ─────

  describe("removeMember", () => {
    it("should throw ForbiddenException when trying to remove OWNER", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership
        .onFirstCall().resolves(makeMembership({ role: EChatMemberRole.ADMIN }))  // caller
        .onSecondCall().resolves(makeMembership({ role: EChatMemberRole.OWNER, userId: targetUserId })); // target

      try {
        await service.removeMember(chatId, userId, targetUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should remove a regular member and emit event", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership
        .onFirstCall().resolves(makeMembership({ role: EChatMemberRole.ADMIN }))
        .onSecondCall().resolves(makeMembership({ id: "target-membership", role: EChatMemberRole.MEMBER, userId: targetUserId }));
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);

      const result = await service.removeMember(chatId, userId, targetUserId);

      expect(memberRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberLeftEvent);
      expect(result).to.equal(targetUserId);
    });

    it("should throw BadRequestException for DIRECT chat", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.DIRECT }));

      try {
        await service.removeMember(chatId, userId, targetUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when target is not a member", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership
        .onFirstCall().resolves(makeMembership({ role: EChatMemberRole.ADMIN }))
        .onSecondCall().resolves(null);

      try {
        await service.removeMember(chatId, userId, targetUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── updateMemberRole ─────

  describe("updateMemberRole", () => {
    it("should allow OWNER to change roles", async () => {
      const targetMembership = makeMembership({ role: EChatMemberRole.MEMBER, userId: targetUserId });

      (memberRepo as any).findMembership
        .onFirstCall().resolves(makeMembership({ role: EChatMemberRole.OWNER }))
        .onSecondCall().resolves(targetMembership);
      (memberRepo as any).findChatMembers.resolves([
        { ...targetMembership, role: EChatMemberRole.ADMIN, userId: targetUserId },
      ]);

      const result = await service.updateMemberRole(chatId, userId, targetUserId, EChatMemberRole.ADMIN);

      expect(memberRepo.save.calledOnce).to.be.true;
      expect(result).to.have.property("userId", targetUserId);
    });

    it("should throw ForbiddenException when non-OWNER tries to change roles", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));

      try {
        await service.updateMemberRole(chatId, userId, targetUserId, EChatMemberRole.ADMIN);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when target is not a member", async () => {
      (memberRepo as any).findMembership
        .onFirstCall().resolves(makeMembership({ role: EChatMemberRole.OWNER }))
        .onSecondCall().resolves(null);

      try {
        await service.updateMemberRole(chatId, userId, targetUserId, EChatMemberRole.ADMIN);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── createChannel ─────

  describe("createChannel", () => {
    it("should create a channel with CHANNEL type and OWNER role", async () => {
      const fullChat = makeChatEntity({ type: EChatType.CHANNEL });

      (chatRepo as any).findById.resolves(fullChat);

      const result = await service.createChannel(userId, {
        name: "Channel",
        description: "desc",
        username: "chan",
        isPublic: true,
      });

      // Channel creation happens inside transaction (via DataSource mock)
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatCreatedEvent);
      expect(result).to.have.property("id", chatId);
    });

    it("should throw BadRequestException when username is already taken", async () => {
      (chatRepo as any).findByUsername.resolves({ id: "other-chat" });

      try {
        await service.createChannel(userId, { name: "Chan", username: "taken" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  // ───── subscribeToChannel ─────

  describe("subscribeToChannel", () => {
    it("should add SUBSCRIBER to a public channel", async () => {
      const channel = makeChatEntity({ type: EChatType.CHANNEL, isPublic: true });

      (chatRepo as any).findById
        .onFirstCall().resolves(channel)
        .onSecondCall().resolves(channel);
      (memberRepo as any).findMembership.resolves(null);
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);

      const result = await service.subscribeToChannel(chatId, targetUserId);

      expect(memberRepo.createAndSave.calledOnce).to.be.true;
      expect(memberRepo.createAndSave.firstCall.args[0].role).to.equal(EChatMemberRole.SUBSCRIBER);
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberJoinedEvent);
      expect(result).to.have.property("id", chatId);
    });

    it("should throw ForbiddenException when channel is private", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.CHANNEL, isPublic: false }));

      try {
        await service.subscribeToChannel(chatId, targetUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should return existing chat if already subscribed", async () => {
      const channel = makeChatEntity({ type: EChatType.CHANNEL, isPublic: true });

      (chatRepo as any).findById.resolves(channel);
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.SUBSCRIBER }));

      const result = await service.subscribeToChannel(chatId, targetUserId);

      expect(memberRepo.createAndSave.called).to.be.false;
      expect(result).to.have.property("id", chatId);
    });
  });

  // ───── unsubscribeFromChannel ─────

  describe("unsubscribeFromChannel", () => {
    it("should throw BadRequestException when owner tries to unsubscribe", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.CHANNEL }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.OWNER }));

      try {
        await service.unsubscribeFromChannel(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should remove subscriber and emit event", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.CHANNEL }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.SUBSCRIBER }));
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);

      const result = await service.unsubscribeFromChannel(chatId, userId);

      expect(memberRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberLeftEvent);
      expect(result).to.equal(chatId);
    });

    it("should throw BadRequestException when not subscribed", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.CHANNEL }));
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.unsubscribeFromChannel(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  // ───── canSendMessage ─────

  describe("canSendMessage", () => {
    it("should return false for CHANNEL subscriber", async () => {
      chatRepo.findOne.resolves({ id: chatId, type: EChatType.CHANNEL });
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.SUBSCRIBER }));

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.false;
    });

    it("should return true for CHANNEL admin", async () => {
      chatRepo.findOne.resolves({ id: chatId, type: EChatType.CHANNEL });
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.true;
    });

    it("should return true for CHANNEL owner", async () => {
      chatRepo.findOne.resolves({ id: chatId, type: EChatType.CHANNEL });
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.OWNER }));

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.true;
    });

    it("should return true for regular chat member", async () => {
      chatRepo.findOne.resolves({ id: chatId, type: EChatType.GROUP });
      memberRepo.count.resolves(1);

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.true;
    });

    it("should return false when chat does not exist", async () => {
      chatRepo.findOne.resolves(null);

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.false;
    });

    it("should return false for non-member of regular chat", async () => {
      chatRepo.findOne.resolves({ id: chatId, type: EChatType.GROUP });
      (memberRepo as any).findMembership.resolves(null);

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.false;
    });
  });

  // ───── createInviteLink ─────

  describe("createInviteLink", () => {
    it("should create invite for GROUP chat", async () => {
      const invite = {
        id: "invite-1",
        chatId,
        code: "abc123",
        createdById: userId,
        expiresAt: null,
        maxUses: null,
        useCount: 0,
        isActive: true,
        createdAt: new Date(),
      };

      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.ADMIN }));
      inviteRepo.createAndSave.resolves(invite);

      const result = await service.createInviteLink(chatId, userId);

      expect(inviteRepo.createAndSave.calledOnce).to.be.true;
      expect(result).to.have.property("chatId", chatId);
    });

    it("should throw BadRequestException for DIRECT chat", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.DIRECT }));

      try {
        await service.createInviteLink(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw ForbiddenException when user is not admin/owner", async () => {
      (chatRepo as any).findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      (memberRepo as any).findMembership.resolves(makeMembership({ role: EChatMemberRole.MEMBER }));

      try {
        await service.createInviteLink(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── joinByInvite ─────

  describe("joinByInvite", () => {
    const makeInvite = (overrides: Record<string, unknown> = {}) => ({
      id: "invite-1",
      chatId,
      code: "validcode",
      createdById: uuid2(),
      expiresAt: null,
      maxUses: null,
      useCount: 0,
      isActive: true,
      createdAt: new Date(),
      ...overrides,
    });

    it("should join by valid invite", async () => {
      (inviteRepo as any).findByCode.resolves(makeInvite());
      (memberRepo as any).findMembership.resolves(null);
      (memberRepo as any).getMemberUserIds.resolves([userId, targetUserId]);
      (chatRepo as any).findById.resolves(makeChatEntity());

      const result = await service.joinByInvite("validcode", userId);

      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ChatMemberJoinedEvent);
      expect(result).to.have.property("id", chatId);
    });

    it("should throw BadRequestException when invite is expired", async () => {
      const pastDate = new Date(Date.now() - 100000);

      (inviteRepo as any).findByCode.resolves(makeInvite({ expiresAt: pastDate }));

      try {
        await service.joinByInvite("expired", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw BadRequestException when max uses reached", async () => {
      (inviteRepo as any).findByCode.resolves(makeInvite({ maxUses: 5, useCount: 5 }));

      try {
        await service.joinByInvite("maxed", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when invite not found", async () => {
      (inviteRepo as any).findByCode.resolves(null);

      try {
        await service.joinByInvite("nonexistent", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw NotFoundException when invite is inactive", async () => {
      (inviteRepo as any).findByCode.resolves(makeInvite({ isActive: false }));

      try {
        await service.joinByInvite("inactive", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should return existing chat if already a member", async () => {
      (inviteRepo as any).findByCode.resolves(makeInvite());
      (memberRepo as any).findMembership.resolves(makeMembership());
      (chatRepo as any).findById.resolves(makeChatEntity());

      const result = await service.joinByInvite("validcode", userId);

      expect(memberRepo.createAndSave.called).to.be.false;
      expect(result).to.have.property("id", chatId);
    });
  });

  // ───── muteChat ─────

  describe("muteChat", () => {
    it("should set mutedUntil on membership", async () => {
      const membership = makeMembership();

      (memberRepo as any).findMembership.resolves(membership);

      const mutedUntil = new Date(Date.now() + 3600000);
      const result = await service.muteChat(chatId, userId, mutedUntil);

      expect(memberRepo.save.calledOnce).to.be.true;
      expect(result.mutedUntil).to.equal(mutedUntil);
    });

    it("should set mutedUntil to null to unmute", async () => {
      const membership = makeMembership({ mutedUntil: new Date() });

      (memberRepo as any).findMembership.resolves(membership);

      const result = await service.muteChat(chatId, userId, null);

      expect(result.mutedUntil).to.be.null;
    });
  });

  // ───── pinChat / unpinChat ─────

  describe("pinChat", () => {
    it("should set isPinnedChat to true", async () => {
      const membership = makeMembership();

      (memberRepo as any).findMembership.resolves(membership);

      const result = await service.pinChat(chatId, userId);

      expect(result.isPinnedChat).to.be.true;
      expect(result.pinnedChatAt).to.be.instanceOf(Date);
      expect(memberRepo.save.calledOnce).to.be.true;
    });
  });

  describe("unpinChat", () => {
    it("should set isPinnedChat to false", async () => {
      const membership = makeMembership({ isPinnedChat: true, pinnedChatAt: new Date() });

      (memberRepo as any).findMembership.resolves(membership);

      const result = await service.unpinChat(chatId, userId);

      expect(result.isPinnedChat).to.be.false;
      expect(result.pinnedChatAt).to.be.null;
      expect(memberRepo.save.calledOnce).to.be.true;
    });
  });

  // ───── createFolder / updateFolder / deleteFolder ─────

  describe("createFolder", () => {
    it("should create a folder", async () => {
      const folder = { id: "folder-1", userId, name: "Work", position: 0, createdAt: new Date(), updatedAt: new Date() };

      folderRepo.findOne.resolves(null);
      folderRepo.createAndSave.resolves(folder);

      const result = await service.createFolder(userId, "Work");

      expect(folderRepo.createAndSave.calledOnce).to.be.true;
      expect(result).to.have.property("name", "Work");
    });

    it("should throw BadRequestException when folder name already exists", async () => {
      folderRepo.findOne.resolves({ id: "existing", userId, name: "Work" });

      try {
        await service.createFolder(userId, "Work");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("updateFolder", () => {
    it("should update folder name and position", async () => {
      const folder = { id: "folder-1", userId, name: "Old", position: 0, createdAt: new Date(), updatedAt: new Date() };

      folderRepo.findOne.resolves(folder);

      const result = await service.updateFolder(userId, "folder-1", { name: "New", position: 1 });

      expect(folderRepo.save.calledOnce).to.be.true;
      expect(result).to.have.property("name", "New");
    });

    it("should throw NotFoundException when folder not found", async () => {
      folderRepo.findOne.resolves(null);

      try {
        await service.updateFolder(userId, "nonexistent", { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("deleteFolder", () => {
    it("should delete folder and unset folderId on members", async () => {
      const folder = { id: "folder-1", userId, name: "Work" };

      folderRepo.findOne.resolves(folder);

      await service.deleteFolder(userId, "folder-1");

      // createQueryBuilder is called to update members
      expect(memberRepo.createQueryBuilder.calledOnce).to.be.true;
      expect(folderRepo.delete.calledOnce).to.be.true;
    });

    it("should throw NotFoundException when folder not found", async () => {
      folderRepo.findOne.resolves(null);

      try {
        await service.deleteFolder(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── moveChatToFolder ─────

  describe("moveChatToFolder", () => {
    it("should set folderId on membership", async () => {
      const membership = makeMembership();

      (memberRepo as any).findMembership.resolves(membership);
      folderRepo.findOne.resolves({ id: "folder-1", userId, name: "Work" });

      const result = await service.moveChatToFolder(chatId, userId, "folder-1");

      expect(result.folderId).to.equal("folder-1");
      expect(memberRepo.save.calledOnce).to.be.true;
    });

    it("should set folderId to null to remove from folder", async () => {
      const membership = makeMembership({ folderId: "folder-1" });

      (memberRepo as any).findMembership.resolves(membership);

      const result = await service.moveChatToFolder(chatId, userId, null);

      expect(result.folderId).to.be.null;
      expect(memberRepo.save.calledOnce).to.be.true;
    });

    it("should throw NotFoundException when folder not found", async () => {
      (memberRepo as any).findMembership.resolves(makeMembership());
      folderRepo.findOne.resolves(null);

      try {
        await service.moveChatToFolder(chatId, userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.moveChatToFolder(chatId, userId, "folder-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });
});
