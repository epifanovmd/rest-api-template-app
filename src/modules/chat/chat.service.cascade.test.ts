import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockFileStorage,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { ChatService } from "./chat.service";
import { EChatMemberRole, EChatType } from "./chat.types";

describe("ChatService — cascade & additional methods", () => {
  let service: ChatService;
  let chatRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let memberRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let inviteRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let folderRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let banRepo: ReturnType<typeof createMockRepository>;
  let userBlock: { isBlockedEither: sinon.SinonStub };
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

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    chatRepo = createMockRepository() as any;
    memberRepo = createMockRepository() as any;
    inviteRepo = createMockRepository() as any;
    folderRepo = createMockRepository() as any;
    eventBus = createMockEventBus();

    const mockTxQb: any = {};
    const txQbMethods = ["innerJoin", "where", "andWhere"];

    for (const m of txQbMethods) {
      mockTxQb[m] = sinon.stub().returns(mockTxQb);
    }
    mockTxQb.getOne = sinon.stub().resolves(null);

    const mockTxRepo = {
      create: sinon.stub().callsFake((data: any) => ({ id: chatId, ...data })),
      save: sinon
        .stub()
        .callsFake((data: any) =>
          Promise.resolve(Array.isArray(data) ? data : { id: chatId, ...data }),
        ),
      createQueryBuilder: sinon.stub().returns(mockTxQb),
      increment: sinon.stub().resolves(),
    };

    banRepo = createMockRepository();
    (banRepo as any).findActiveBan = sinon.stub().resolves(null);
    (banRepo as any).findActiveBannedUserIds = sinon.stub().resolves([]);
    userBlock = { isBlockedEither: sinon.stub().resolves(false) };

    service = new ChatService(
      chatRepo as any,
      memberRepo as any,
      inviteRepo as any,
      folderRepo as any,
      eventBus as any,
      {
        transaction: sinon
          .stub()
          .callsFake((cb: any) =>
            cb({ getRepository: sinon.stub().returns(mockTxRepo) }),
          ),
      } as any,
      banRepo as any,
      userBlock as any,
      new FileUrlService(createMockFileStorage() as any),
    );

    // Default stubs for custom repo methods
    chatRepo.findById = sinon.stub().resolves(makeChatEntity());
    chatRepo.findByIdLight = sinon
      .stub()
      .callsFake((id: string) => chatRepo.findById(id));
    chatRepo.findDirectChat = sinon.stub().resolves(null);
    chatRepo.findByUsername = sinon.stub().resolves(null);
    chatRepo.findUserChats = sinon.stub().resolves([]);
    chatRepo.findPublicChannels = sinon.stub().resolves([]);
    memberRepo.findMembership = sinon.stub().resolves(makeMembership());
    memberRepo.countMembers = sinon.stub().resolves(1);
    memberRepo.getMemberUserIds = sinon.stub().resolves([userId]);
    memberRepo.findMembershipsWithProfile = sinon.stub().resolves([]);
    Object.assign(memberRepo, {
      insertIgnore: sinon
        .stub()
        .callsFake(async (rows: Array<{ userId: string }>) =>
          rows.map(r => r.userId),
        ),
      findExistingUserIds: sinon.stub().callsFake(async (ids: string[]) => ids),
      findPreviewMembers: sinon.stub().resolves([]),
      countByChatIds: sinon.stub().resolves({}),
      findMembershipWithProfile: sinon.stub().resolves(null),
      hideMembership: sinon.stub().resolves(),
      unhideMembership: sinon.stub().resolves(),
      setRole: sinon.stub().resolves(),
    });
    Object.assign(chatRepo, {
      insertDirectChat: sinon.stub().resolves(chatId),
    });
    Object.assign(inviteRepo, {
      consumeUse: sinon.stub().resolves(true),
    });
    Object.assign(folderRepo, {
      findByUserAndName: sinon.stub().resolves(null),
    });
    inviteRepo.findByCode = sinon.stub().resolves(null);
    inviteRepo.findByChatId = sinon.stub().resolves([]);
    folderRepo.findByUser = sinon.stub().resolves([]);
  });

  afterEach(() => sandbox.restore());

  // ───── getUserChats ─────

  describe("getUserChats", () => {
    it("should call repository and return result", async () => {
      const chats = [makeChatEntity(), makeChatEntity({ id: "chat-2" })];

      chatRepo.findUserChats.resolves([chats, 2]);

      const page = await service.getUserChats(userId, 0, 10);

      expect(chatRepo.findUserChats.calledOnceWith(userId, 0, 10)).to.be.true;
      expect(page).to.include({ total: 2, offset: 0, limit: 10 });
      expect(page.items.map(d => d.id)).to.deep.equal([chatId, "chat-2"]);
    });

    it("без offset/limit — умолчания пагинации, limit не больше 100", async () => {
      chatRepo.findUserChats.resolves([[], 0]);

      await service.getUserChats(userId);
      await service.getUserChats(userId, -5, 10_000);

      expect(chatRepo.findUserChats.firstCall.args).to.deep.equal([
        userId,
        0,
        20,
      ]);
      expect(chatRepo.findUserChats.secondCall.args).to.deep.equal([
        userId,
        0,
        100,
      ]);
    });
  });

  // ───── getPublicChannels ─────

  describe("getPublicChannels", () => {
    it("should call repository with query parameters", async () => {
      const channels = [
        makeChatEntity({ type: EChatType.CHANNEL, isPublic: true }),
      ];

      chatRepo.findPublicChannels.resolves([channels, 1]);

      const result = await service.getPublicChannels("search", 0, 20);

      expect(chatRepo.findPublicChannels.calledOnceWith("search", 0, 20)).to.be
        .true;
      expect(result.total).to.equal(1);
      expect(result.items.map(c => c.id)).to.deep.equal([channels[0].id]);
    });
  });

  // ───── getInvites ─────

  describe("getInvites", () => {
    it("should return invites when user is admin/owner", async () => {
      const invites = [makeInvite(), makeInvite({ id: "invite-2" })];

      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.ADMIN }),
      );
      inviteRepo.findByChatId.resolves([invites, 2]);

      const result = await service.getInvites(chatId, userId);

      expect(inviteRepo.findByChatId.calledOnceWith(chatId, 0, 20)).to.be.true;
      expect(result.items).to.have.length(2);
      expect(result.total).to.equal(2);
    });

    it("should throw ForbiddenException when user is regular member", async () => {
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.MEMBER }),
      );

      try {
        await service.getInvites(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  // ───── revokeInvite ─────

  describe("revokeInvite", () => {
    it("should deactivate invite when user is admin", async () => {
      const invite = makeInvite();

      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.ADMIN }),
      );
      inviteRepo.findOne.resolves(invite);

      await service.revokeInvite(chatId, "invite-1", userId);

      expect(invite.isActive).to.be.false;
      expect(inviteRepo.save.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when user is regular member", async () => {
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.MEMBER }),
      );

      try {
        await service.revokeInvite(chatId, "invite-1", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });

    it("should throw NotFoundException when invite not found", async () => {
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.ADMIN }),
      );
      inviteRepo.findOne.resolves(null);

      try {
        await service.revokeInvite(chatId, "nonexistent", userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── updateChannel ─────

  describe("updateChannel", () => {
    it("should update channel successfully", async () => {
      const channel = makeChatEntity({ type: EChatType.CHANNEL, name: "Old" });
      const updated = makeChatEntity({ type: EChatType.CHANNEL, name: "New" });

      chatRepo.findById
        .onFirstCall()
        .resolves(channel)
        .onSecondCall()
        .resolves(updated);
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.OWNER }),
      );

      const result = await service.updateChannel(chatId, userId, {
        name: "New",
      });

      expect(chatRepo.save.calledOnce).to.be.true;
      expect(chatRepo.save.firstCall.args[0].name).to.equal("New");
      expect(result).to.have.property("id", chatId);
    });

    it("should throw BadRequestException when chat is not a channel", async () => {
      chatRepo.findById.resolves(makeChatEntity({ type: EChatType.GROUP }));

      try {
        await service.updateChannel(chatId, userId, { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
        expect((err as any).message).to.include("не канал");
      }
    });

    it("should throw BadRequestException when username is already taken", async () => {
      const channel = makeChatEntity({
        type: EChatType.CHANNEL,
        username: "old",
      });

      chatRepo.findById
        .onFirstCall()
        .resolves(channel)
        .onSecondCall()
        .resolves(channel);
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.OWNER }),
      );
      chatRepo.findByUsername.resolves({ id: "other-chat-id" });

      try {
        await service.updateChannel(chatId, userId, { username: "taken" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 409);
        expect((err as any).message).to.include("username уже занят");
      }
    });

    it("should throw NotFoundException when channel not found", async () => {
      chatRepo.findById.resolves(null);

      try {
        await service.updateChannel(chatId, userId, { name: "New" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── isMember ─────

  describe("isMember", () => {
    it("should return true when membership exists", async () => {
      memberRepo.count.resolves(1);

      const result = await service.isMember(chatId, userId);

      expect(result).to.be.true;
    });

    it("should return false when membership does not exist", async () => {
      memberRepo.count.resolves(0);

      const result = await service.isMember(chatId, userId);

      expect(result).to.be.false;
    });
  });

  // ───── getMemberUserIds ─────

  describe("getMemberUserIds", () => {
    it("should return list of user IDs", async () => {
      memberRepo.getMemberUserIds.resolves([userId, targetUserId]);

      const result = await service.getMemberUserIds(chatId);

      expect(result).to.deep.equal([userId, targetUserId]);
      expect(memberRepo.getMemberUserIds.calledOnceWith(chatId)).to.be.true;
    });
  });

  // ───── canSendMessage — chat not found ─────

  describe("canSendMessage", () => {
    it("should return false when chat not found", async () => {
      chatRepo.findOne.resolves(null);

      const result = await service.canSendMessage(chatId, userId);

      expect(result).to.be.false;
    });
  });

  // ───── deleteFolder cascade ─────

  describe("deleteFolder — cascade", () => {
    it("should unset folderId on all members THEN delete folder", async () => {
      const folder = { id: "folder-1", userId, name: "Work" };

      folderRepo.findOne.resolves(folder);

      await service.deleteFolder(userId, "folder-1");

      // Verify the query builder was used to update members
      expect(memberRepo.createQueryBuilder.calledOnce).to.be.true;
      const qb = memberRepo.createQueryBuilder.returnValues[0];

      expect(qb.update.calledOnce).to.be.true;
      expect(qb.set.calledOnce).to.be.true;
      expect(qb.where.calledOnce).to.be.true;
      expect(qb.andWhere.calledOnce).to.be.true;
      expect(qb.execute.calledOnce).to.be.true;

      // Verify folder is deleted after member update
      expect(folderRepo.delete.calledOnce).to.be.true;
      expect(folderRepo.delete.firstCall.args[0]).to.deep.equal({
        id: "folder-1",
      });
    });

    it("should throw NotFoundException when folder not found", async () => {
      folderRepo.findOne.resolves(null);

      try {
        await service.deleteFolder(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── leaveChat — CHANNEL owner can't leave if members > 1 ─────

  describe("leaveChat — CHANNEL owner", () => {
    it("should throw when CHANNEL owner tries to leave with other members", async () => {
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.OWNER }),
      );
      chatRepo.findById.resolves(makeChatEntity({ type: EChatType.CHANNEL }));
      memberRepo.countMembers.resolves(3);

      try {
        await service.leaveChat(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 409);
        expect((err as any).message).to.include("Передайте права владельца");
      }
    });
  });

  // ───── addMembers — empty newMemberIds after filtering ─────

  describe("addMembers — edge cases", () => {
    it("should not add members when all provided IDs are already members", async () => {
      chatRepo.findById.resolves(makeChatEntity({ type: EChatType.GROUP }));
      memberRepo.findMembership.resolves(
        makeMembership({ role: EChatMemberRole.ADMIN }),
      );
      memberRepo.getMemberUserIds.resolves([userId, targetUserId]);
      memberRepo.findMembershipsWithProfile.resolves([]);

      await service.addMembers(chatId, userId, [targetUserId]);

      expect(memberRepo.createAndSave.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });
  });

  // ───── joinByInvite — already member ─────

  describe("joinByInvite — already member", () => {
    it("should return existing chat without incrementing useCount", async () => {
      const invite = makeInvite({ useCount: 3 });

      inviteRepo.findByCode.resolves(invite);
      memberRepo.findMembership.resolves(makeMembership());
      chatRepo.findById.resolves(makeChatEntity());

      const result = await service.joinByInvite("validcode", userId);

      // Should NOT create new membership
      expect(memberRepo.createAndSave.called).to.be.false;
      // Should NOT increment useCount
      expect(invite.useCount).to.equal(3);
      expect(inviteRepo.save.called).to.be.false;
      // Should NOT emit event
      expect(eventBus.emit.called).to.be.false;
      // Should return the chat
      expect(result).to.have.property("id", chatId);
    });
  });
});
