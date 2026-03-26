import "reflect-metadata";

import { BadRequestException, ForbiddenException, NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockQueryBuilder, createMockRepository, uuid, uuid2, uuid3 } from "../../test/helpers";
import { EChatMemberRole } from "../chat/chat.types";
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
import { MessageService } from "./message.service";
import { EMessageStatus, EMessageType } from "./message.types";

describe("MessageService", () => {
  let service: MessageService;
  let messageRepo: ReturnType<typeof createMockRepository>;
  let attachmentRepo: ReturnType<typeof createMockRepository>;
  let reactionRepo: ReturnType<typeof createMockRepository>;
  let mentionRepo: ReturnType<typeof createMockRepository>;
  let chatRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let chatService: Record<string, sinon.SinonStub>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let linkPreviewService: Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const otherUserId = uuid2();
  const chatId = uuid3();
  const messageId = "msg-001";

  const makeMessageEntity = (overrides: Record<string, unknown> = {}) => ({
    id: messageId,
    chatId,
    senderId: userId,
    type: EMessageType.TEXT,
    status: EMessageStatus.SENT,
    content: "Hello world",
    replyToId: null,
    forwardedFromId: null,
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    pinnedAt: null,
    pinnedById: null,
    stickerId: null,
    encryptedContent: null,
    encryptionMetadata: null,
    keyboard: null,
    linkPreviews: null,
    scheduledAt: null,
    isScheduled: false,
    selfDestructSeconds: null,
    selfDestructAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: null,
    replyTo: null,
    attachments: [],
    reactions: [],
    mentions: [],
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    messageRepo = createMockRepository();
    attachmentRepo = createMockRepository();
    reactionRepo = createMockRepository();
    mentionRepo = createMockRepository();
    chatRepo = createMockRepository();
    memberRepo = createMockRepository();
    eventBus = createMockEventBus();
    linkPreviewService = {
      getPreviewsForContent: sinon.stub().resolves([]),
    };

    chatService = {
      canSendMessage: sinon.stub().resolves(true),
      isMember: sinon.stub().resolves(true),
      getMemberUserIds: sinon.stub().resolves([userId, otherUserId]),
    };

    service = new MessageService(
      messageRepo as any,
      attachmentRepo as any,
      reactionRepo as any,
      mentionRepo as any,
      chatRepo as any,
      memberRepo as any,
      chatService as any,
      eventBus as any,
      linkPreviewService as any,
    );

    // Default repo stubs
    (messageRepo as any).findById = sinon.stub().resolves(makeMessageEntity());
    (messageRepo as any).findByChatCursor = sinon.stub().resolves({ messages: [], hasMore: false });
    (messageRepo as any).searchInChat = sinon.stub().resolves([[], 0]);
    (messageRepo as any).searchGlobal = sinon.stub().resolves([[], 0]);
    (messageRepo as any).findMediaByChatId = sinon.stub().resolves([[], 0]);
    (messageRepo as any).getMediaStats = sinon.stub().resolves({ images: 0, videos: 0, audio: 0, documents: 0, total: 0 });
    (reactionRepo as any).findByUserAndMessage = sinon.stub().resolves(null);
    (memberRepo as any).findMembership = sinon.stub().resolves({
      id: "mem-1",
      chatId,
      userId,
      role: EChatMemberRole.MEMBER,
      lastReadMessageId: null,
    });
  });

  afterEach(() => sandbox.restore());

  // ───── sendMessage ─────

  describe("sendMessage", () => {
    it("should create message and emit MessageCreatedEvent when user is a member", async () => {
      const savedMsg = makeMessageEntity();

      messageRepo.withTransaction.callsFake(async (cb: any) => {
        const mockRepo = {
          create: sinon.stub().returns(savedMsg),
          save: sinon.stub().resolves(savedMsg),
        };
        const mockEm = {
          getRepository: sinon.stub().returns({
            save: sinon.stub().resolves(),
            update: sinon.stub().resolves(),
          }),
        };

        return cb(mockRepo, mockEm);
      });

      (messageRepo as any).findById.resolves(savedMsg);

      const result = await service.sendMessage(chatId, userId, { content: "Hello" });

      expect(result).to.have.property("id", messageId);
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageCreatedEvent);
    });

    it("should throw ForbiddenException when user cannot send (non-member)", async () => {
      chatService.canSendMessage.resolves(false);

      try {
        await service.sendMessage(chatId, userId, { content: "Hello" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw ForbiddenException for channel subscriber", async () => {
      chatService.canSendMessage.resolves(false);

      try {
        await service.sendMessage(chatId, userId, { content: "Hello" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should set isScheduled=true and NOT emit event for scheduled messages", async () => {
      const scheduledMsg = makeMessageEntity({ isScheduled: true, scheduledAt: new Date(Date.now() + 60000) });

      messageRepo.withTransaction.callsFake(async (cb: any) => {
        const mockRepo = {
          create: sinon.stub().returns(scheduledMsg),
          save: sinon.stub().resolves(scheduledMsg),
        };
        const mockEm = {
          getRepository: sinon.stub().returns({
            save: sinon.stub().resolves(),
            update: sinon.stub().resolves(),
          }),
        };

        return cb(mockRepo, mockEm);
      });

      (messageRepo as any).findById.resolves(scheduledMsg);

      const result = await service.sendMessage(chatId, userId, {
        content: "Later",
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
      });

      expect(result).to.have.property("isScheduled", true);
      expect(eventBus.emit.called).to.be.false;
    });
  });

  // ───── getMessages ─────

  describe("getMessages", () => {
    it("should return cursor-based paginated list for a member", async () => {
      const msgs = [makeMessageEntity(), makeMessageEntity({ id: "msg-002" })];

      (messageRepo as any).findByChatCursor.resolves({ messages: msgs, hasMore: true });

      const result = await service.getMessages(chatId, userId);

      expect(result.data).to.have.length(2);
      expect(result.hasMore).to.be.true;
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getMessages(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── editMessage ─────

  describe("editMessage", () => {
    it("should update content and set isEdited=true for own message", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById
        .onFirstCall().resolves(msg)
        .onSecondCall().resolves({ ...msg, content: "Updated", isEdited: true });

      const result = await service.editMessage(messageId, userId, "Updated");

      expect(messageRepo.save.calledOnce).to.be.true;
      expect(msg.content).to.equal("Updated");
      expect(msg.isEdited).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageUpdatedEvent);
    });

    it("should throw ForbiddenException when editing other's message", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ senderId: otherUserId }));

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw BadRequestException when editing deleted message", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ isDeleted: true }));

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── deleteMessage ─────

  describe("deleteMessage", () => {
    it("should soft delete own message (isDeleted=true, content=null)", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById.resolves(msg);

      await service.deleteMessage(messageId, userId);

      expect(msg.isDeleted).to.be.true;
      expect(msg.content).to.be.null;
      expect(messageRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageDeletedEvent);
    });

    it("should allow admin to delete others' messages", async () => {
      const msg = makeMessageEntity({ senderId: otherUserId });

      (messageRepo as any).findById.resolves(msg);
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.ADMIN,
      });

      await service.deleteMessage(messageId, userId);

      expect(msg.isDeleted).to.be.true;
      expect(messageRepo.save.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when regular member tries to delete others' messages", async () => {
      const msg = makeMessageEntity({ senderId: otherUserId });

      (messageRepo as any).findById.resolves(msg);
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.MEMBER,
      });

      try {
        await service.deleteMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.deleteMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw ForbiddenException when non-member tries to delete others' messages", async () => {
      const msg = makeMessageEntity({ senderId: otherUserId });

      (messageRepo as any).findById.resolves(msg);
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.deleteMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── pinMessage ─────

  describe("pinMessage", () => {
    it("should pin message when user is admin/owner and emit event", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById
        .onFirstCall().resolves(msg)
        .onSecondCall().resolves({ ...msg, isPinned: true, pinnedAt: new Date(), pinnedById: userId });
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.ADMIN,
      });

      const result = await service.pinMessage(messageId, userId);

      expect(msg.isPinned).to.be.true;
      expect(msg.pinnedById).to.equal(userId);
      expect(messageRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessagePinnedEvent);
    });

    it("should throw ForbiddenException when regular member tries to pin", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.MEMBER,
      });

      try {
        await service.pinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.pinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.pinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── unpinMessage ─────

  describe("unpinMessage", () => {
    it("should unpin message when user is admin/owner", async () => {
      const msg = makeMessageEntity({ isPinned: true, pinnedAt: new Date(), pinnedById: userId });

      (messageRepo as any).findById.resolves(msg);
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.OWNER,
      });

      await service.unpinMessage(messageId, userId);

      expect(msg.isPinned).to.be.false;
      expect(msg.pinnedAt).to.be.null;
      expect(msg.pinnedById).to.be.null;
      expect(messageRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageUnpinnedEvent);
    });

    it("should throw ForbiddenException for regular member", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.MEMBER,
      });

      try {
        await service.unpinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── addReaction ─────

  describe("addReaction", () => {
    it("should create a new reaction for a member", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      chatService.isMember.resolves(true);
      (reactionRepo as any).findByUserAndMessage.resolves(null);

      await service.addReaction(messageId, userId, "thumbsup");

      expect(reactionRepo.createAndSave.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageReactionEvent);
    });

    it("should update existing reaction", async () => {
      const existingReaction = { id: "react-1", messageId, userId, emoji: "thumbsup" };

      (messageRepo as any).findById.resolves(makeMessageEntity());
      chatService.isMember.resolves(true);
      (reactionRepo as any).findByUserAndMessage.resolves(existingReaction);

      await service.addReaction(messageId, userId, "heart");

      expect(existingReaction.emoji).to.equal("heart");
      expect(reactionRepo.save.calledOnce).to.be.true;
      expect(reactionRepo.createAndSave.called).to.be.false;
    });

    it("should throw ForbiddenException for non-member", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      chatService.isMember.resolves(false);

      try {
        await service.addReaction(messageId, userId, "thumbsup");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.addReaction(messageId, userId, "thumbsup");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── removeReaction ─────

  describe("removeReaction", () => {
    it("should remove existing reaction and emit event", async () => {
      const existingReaction = { id: "react-1", messageId, userId, emoji: "thumbsup" };

      (messageRepo as any).findById.resolves(makeMessageEntity());
      (reactionRepo as any).findByUserAndMessage.resolves(existingReaction);

      await service.removeReaction(messageId, userId);

      expect(reactionRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      const emittedEvent = eventBus.emit.firstCall.args[0];

      expect(emittedEvent).to.be.instanceOf(MessageReactionEvent);
    });

    it("should do nothing when no reaction exists", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      (reactionRepo as any).findByUserAndMessage.resolves(null);

      await service.removeReaction(messageId, userId);

      expect(reactionRepo.delete.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.removeReaction(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── markAsDelivered ─────

  describe("markAsDelivered", () => {
    it("should update status to DELIVERED and emit event", async () => {
      chatService.isMember.resolves(true);
      const qb = createMockQueryBuilder();

      messageRepo.createQueryBuilder.returns(qb);

      await service.markAsDelivered(chatId, userId, ["msg-1", "msg-2"]);

      expect(messageRepo.createQueryBuilder.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageDeliveredEvent);
    });

    it("should do nothing when user is not a member", async () => {
      chatService.isMember.resolves(false);

      await service.markAsDelivered(chatId, userId, ["msg-1"]);

      expect(messageRepo.createQueryBuilder.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });
  });

  // ───── markAsRead ─────

  describe("markAsRead", () => {
    it("should update lastReadMessageId and status to READ", async () => {
      const membership = { id: "mem-1", chatId, userId, role: EChatMemberRole.MEMBER, lastReadMessageId: null };
      const readMsg = { id: messageId, createdAt: new Date() };
      const qb = createMockQueryBuilder();

      (memberRepo as any).findMembership.resolves(membership);
      messageRepo.findOne.resolves(readMsg);
      messageRepo.createQueryBuilder.returns(qb);

      await service.markAsRead(chatId, userId, messageId);

      expect(membership.lastReadMessageId).to.equal(messageId);
      expect(memberRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(MessageReadEvent);
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.markAsRead(chatId, userId, messageId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── searchMessages ─────

  describe("searchMessages", () => {
    it("should search messages in chat for a member", async () => {
      chatService.isMember.resolves(true);
      const msgs = [makeMessageEntity()];

      (messageRepo as any).searchInChat.resolves([msgs, 1]);

      const result = await service.searchMessages(chatId, userId, "hello");

      expect(result.data).to.have.length(1);
      expect(result.totalCount).to.equal(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.searchMessages(chatId, userId, "hello");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── searchGlobalMessages ─────

  describe("searchGlobalMessages", () => {
    it("should search across all user's chats", async () => {
      memberRepo.find.resolves([{ chatId: "chat-1" }, { chatId: "chat-2" }]);
      const msgs = [makeMessageEntity()];

      (messageRepo as any).searchGlobal.resolves([msgs, 1]);

      const result = await service.searchGlobalMessages(userId, "hello");

      expect(result.data).to.have.length(1);
      expect(result.totalCount).to.equal(1);
    });

    it("should return empty when user has no chats", async () => {
      memberRepo.find.resolves([]);

      const result = await service.searchGlobalMessages(userId, "hello");

      expect(result.data).to.have.length(0);
      expect(result.totalCount).to.equal(0);
    });
  });

  // ───── getPinnedMessages ─────

  describe("getPinnedMessages", () => {
    it("should return pinned messages for a member", async () => {
      chatService.isMember.resolves(true);
      const msgs = [makeMessageEntity({ isPinned: true })];

      messageRepo.find.resolves(msgs);

      const result = await service.getPinnedMessages(chatId, userId);

      expect(result).to.have.length(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getPinnedMessages(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── getScheduledMessages ─────

  describe("getScheduledMessages", () => {
    it("should return scheduled messages for a member", async () => {
      chatService.isMember.resolves(true);
      const msgs = [makeMessageEntity({ isScheduled: true, scheduledAt: new Date() })];

      messageRepo.find.resolves(msgs);

      const result = await service.getScheduledMessages(chatId, userId);

      expect(result).to.have.length(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getScheduledMessages(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── cancelScheduledMessage ─────

  describe("cancelScheduledMessage", () => {
    it("should delete own scheduled message", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ isScheduled: true }));

      await service.cancelScheduledMessage(messageId, userId);

      expect(messageRepo.delete.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when cancelling other's message", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ senderId: otherUserId, isScheduled: true }));

      try {
        await service.cancelScheduledMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw BadRequestException when message is not scheduled", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ isScheduled: false }));

      try {
        await service.cancelScheduledMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.cancelScheduledMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── markMessageOpened ─────

  describe("markMessageOpened", () => {
    it("should set selfDestructAt for self-destruct message when recipient opens", async () => {
      const msg = makeMessageEntity({ senderId: otherUserId, selfDestructSeconds: 30, selfDestructAt: null });

      (messageRepo as any).findById
        .onFirstCall().resolves(msg)
        .onSecondCall().resolves({ ...msg, selfDestructAt: new Date() });

      const result = await service.markMessageOpened(messageId, userId);

      expect(msg.selfDestructAt).to.be.instanceOf(Date);
      expect(messageRepo.save.calledOnce).to.be.true;
    });

    it("should return message without setting timer when sender opens their own", async () => {
      const msg = makeMessageEntity({ selfDestructSeconds: 30, selfDestructAt: null });

      (messageRepo as any).findById.resolves(msg);

      const result = await service.markMessageOpened(messageId, userId);

      expect(msg.selfDestructAt).to.be.null;
      expect(messageRepo.save.called).to.be.false;
    });

    it("should throw BadRequestException when message is not self-destruct", async () => {
      (messageRepo as any).findById.resolves(makeMessageEntity({ selfDestructSeconds: null }));

      try {
        await service.markMessageOpened(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should not reset timer if selfDestructAt is already set", async () => {
      const existingDate = new Date(Date.now() + 10000);
      const msg = makeMessageEntity({
        senderId: otherUserId,
        selfDestructSeconds: 30,
        selfDestructAt: existingDate,
      });

      (messageRepo as any).findById.resolves(msg);

      await service.markMessageOpened(messageId, userId);

      expect(msg.selfDestructAt).to.equal(existingDate);
      expect(messageRepo.save.called).to.be.false;
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.markMessageOpened(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── getChatMedia ─────

  describe("getChatMedia", () => {
    it("should return media with filter for a member", async () => {
      chatService.isMember.resolves(true);
      const msgs = [makeMessageEntity({ type: EMessageType.IMAGE })];

      (messageRepo as any).findMediaByChatId.resolves([msgs, 1]);

      const result = await service.getChatMedia(chatId, userId, "image");

      expect(result.data).to.have.length(1);
      expect(result.totalCount).to.equal(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getChatMedia(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  // ───── getChatMediaStats ─────

  describe("getChatMediaStats", () => {
    it("should return stats for a member", async () => {
      chatService.isMember.resolves(true);
      const stats = { images: 5, videos: 3, audio: 1, documents: 2, total: 11 };

      (messageRepo as any).getMediaStats.resolves(stats);

      const result = await service.getChatMediaStats(chatId, userId);

      expect(result).to.deep.equal(stats);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getChatMediaStats(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });
});
