import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  TooManyRequestsException,
} from "../../core/http";
import {
  createMockEventBus,
  createMockFileStorage,
  createMockQueryBuilder,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { EChatMemberRole, EChatType } from "../chat/chat.types";
import { EFileStatus, FileUrlService } from "../file";
import { File } from "../file/file.entity";
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
import { MessageAttachment } from "./message-attachment.entity";

describe("MessageService", () => {
  let service: MessageService;
  let messageRepo: ReturnType<typeof createMockRepository>;
  let attachmentRepo: ReturnType<typeof createMockRepository>;
  let reactionRepo: ReturnType<typeof createMockRepository>;
  let deletionRepo: ReturnType<typeof createMockRepository>;
  let mentionRepo: ReturnType<typeof createMockRepository>;
  let chatRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let chatService: Record<string, sinon.SinonStub>;
  let receiptRepo: Record<string, sinon.SinonStub>;
  let pollRepo: Record<string, sinon.SinonStub>;
  let userBlockService: { isBlockedEither: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
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
    keyboard: null,
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
    deletionRepo = createMockRepository();
    (deletionRepo as any).deleteForUser = sinon.stub().resolves();
    mentionRepo = createMockRepository();
    chatRepo = createMockRepository();
    memberRepo = createMockRepository();
    eventBus = createMockEventBus();

    chatService = {
      canSendMessage: sinon.stub().resolves(true),
      isMember: sinon.stub().resolves(true),
      getMemberUserIds: sinon.stub().resolves([userId, otherUserId]),
    };

    pollRepo = {
      findByMessageIds: sinon.stub().resolves([]),
      findByMessageId: sinon.stub().resolves(null),
      update: sinon.stub().resolves({ affected: 1 }),
    };

    userBlockService = { isBlockedEither: sinon.stub().resolves(false) };

    receiptRepo = {
      upsertReceipts: sinon.stub().resolves([]),
      getReceiptSummary: sinon
        .stub()
        .resolves({ delivered: 0, read: 0, total: 0 }),
    };

    service = new MessageService(
      messageRepo as any,
      attachmentRepo as any,
      reactionRepo as any,
      deletionRepo as any,
      mentionRepo as any,
      chatRepo as any,
      memberRepo as any,
      chatService as any,
      pollRepo as any,
      receiptRepo as any,
      eventBus as any,
      userBlockService as any,
      new FileUrlService(createMockFileStorage() as any),
    );

    // Default repo stubs
    (chatRepo as any).findOne = sinon
      .stub()
      .resolves({ id: chatId, type: EChatType.DIRECT, slowModeSeconds: 0 });
    (messageRepo as any).findById = sinon.stub().resolves(makeMessageEntity());
    (messageRepo as any).findOlder = sinon
      .stub()
      .resolves({ messages: [], hasMore: false });
    (messageRepo as any).findNewer = sinon
      .stub()
      .resolves({ messages: [], hasMore: false });
    (messageRepo as any).findAround = sinon.stub().resolves(null);
    (messageRepo as any).searchInChat = sinon.stub().resolves([[], 0]);
    (messageRepo as any).searchGlobal = sinon.stub().resolves([[], 0]);
    (messageRepo as any).findMediaByChatId = sinon.stub().resolves([[], 0]);
    (messageRepo as any).findPinnedByChatId = sinon.stub().resolves([[], 0]);
    (messageRepo as any).findLastBySender = sinon.stub().resolves(null);
    (messageRepo as any).markDeleted = sinon.stub().resolves(true);
    (messageRepo as any).getMediaStats = sinon
      .stub()
      .resolves({ images: 0, videos: 0, audio: 0, documents: 0, total: 0 });
    (reactionRepo as any).findByUserAndMessage = sinon.stub().resolves(null);
    (memberRepo as any).findMembership = sinon.stub().resolves({
      id: "mem-1",
      chatId,
      userId,
      role: EChatMemberRole.MEMBER,
      lastReadMessageId: null,
    });
    // Денормализованные счётчики непрочитанного в chat_members
    (memberRepo as any).incrementUnreadForChat = sinon.stub().resolves();
    (memberRepo as any).getUserChatIds = sinon.stub().resolves([]);
    (memberRepo as any).getMemberUserIds = sinon
      .stub()
      .resolves([userId, otherUserId]);
    (memberRepo as any).unhideForChat = sinon.stub().resolves();
    (memberRepo as any).decrementUnreadForDeletedMessage = sinon
      .stub()
      .resolves();
  });

  /** Транзакция с менеджером, который умеет query builder, findOne и save. */
  const stubTransaction = () => {
    const em = {
      createQueryBuilder: sinon
        .stub()
        .callsFake(() => createMockQueryBuilder()),
      findOne: sinon.stub().resolves(null),
      save: sinon
        .stub()
        .callsFake((entity: unknown) => Promise.resolve(entity)),
      query: sinon.stub().resolves([]),
      getRepository: sinon.stub().returns(createMockRepository()),
    };

    messageRepo.withTransaction.callsFake(async (cb: any) =>
      cb(createMockRepository(), em),
    );

    return em;
  };

  afterEach(() => {
    sandbox.restore();
    sinon.restore();
  });

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

      const result = await service.sendMessage(chatId, userId, {
        content: "Hello",
      });

      expect(result).to.have.property("id", messageId);
      // Счётчик получателей растёт до эмиссии событий
      expect(
        (memberRepo as any).incrementUnreadForChat.calledOnceWith(
          chatId,
          userId,
        ),
      ).to.be.true;

      // Ждём fire-and-forget эмиссию событий
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.emit.called).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageCreatedEvent,
      );
    });

    it("should throw ForbiddenException when user cannot send (non-member)", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.sendMessage(chatId, userId, { content: "Hello" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });

    it("should throw ForbiddenException for channel subscriber", async () => {
      (chatRepo as any).findOne.resolves({ id: chatId, type: "channel" });
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.SUBSCRIBER,
      });

      try {
        await service.sendMessage(chatId, userId, { content: "Hello" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  // ───── getMessages ─────

  describe("getMessages", () => {
    const at = (iso: string) => new Date(iso);
    const decode = (cursor: string | null) =>
      cursor
        ? JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
        : null;

    it("без курсора — последние, nextCursor к более старым, prevCursor null", async () => {
      const msgs = [
        makeMessageEntity({ id: "m-2", createdAt: at("2026-01-02") }),
        makeMessageEntity({ id: "m-1", createdAt: at("2026-01-01") }),
      ];

      (messageRepo as any).findOlder.resolves({
        messages: msgs,
        hasMore: true,
      });

      const result = await service.getMessages(chatId, userId);

      expect((messageRepo as any).findOlder.firstCall.args).to.deep.equal([
        chatId,
        userId,
        null,
        50,
      ]);
      expect(result.items.map(m => m.id)).to.deep.equal(["m-2", "m-1"]);
      expect(decode(result.nextCursor)).to.deep.equal({
        t: "2026-01-01T00:00:00.000Z",
        id: "m-1",
        d: "older",
      });
      expect(result.prevCursor).to.be.null;
    });

    it("последняя страница — nextCursor null", async () => {
      (messageRepo as any).findOlder.resolves({
        messages: [makeMessageEntity()],
        hasMore: false,
      });

      const result = await service.getMessages(chatId, userId);

      expect(result.nextCursor).to.be.null;
    });

    it("nextCursor ведёт к более старым по ключу (createdAt, id)", async () => {
      const first = await (async () => {
        (messageRepo as any).findOlder.resolves({
          messages: [
            makeMessageEntity({ id: "m-5", createdAt: at("2026-01-05") }),
          ],
          hasMore: true,
        });

        return service.getMessages(chatId, userId, { limit: 1 });
      })();

      (messageRepo as any).findOlder.resetHistory();
      (messageRepo as any).findOlder.resolves({
        messages: [
          makeMessageEntity({ id: "m-4", createdAt: at("2026-01-04") }),
        ],
        hasMore: false,
      });

      const next = await service.getMessages(chatId, userId, {
        cursor: first.nextCursor!,
        limit: 1,
      });
      const [, , key, limit] = (messageRepo as any).findOlder.firstCall.args;

      expect(key).to.deep.equal({ createdAt: at("2026-01-05"), id: "m-5" });
      expect(limit).to.equal(1);
      expect(next.nextCursor).to.be.null;
      expect(decode(next.prevCursor)).to.include({ id: "m-4", d: "newer" });
    });

    it("prevCursor ведёт к более новым; на свежем конце prevCursor null", async () => {
      (messageRepo as any).findNewer.resolves({
        messages: [
          makeMessageEntity({ id: "m-7", createdAt: at("2026-01-07") }),
          makeMessageEntity({ id: "m-6", createdAt: at("2026-01-06") }),
        ],
        hasMore: false,
      });

      const cursor = Buffer.from(
        JSON.stringify({
          t: "2026-01-05T00:00:00.000Z",
          id: "m-5",
          d: "newer",
        }),
      ).toString("base64url");
      const result = await service.getMessages(chatId, userId, { cursor });

      expect((messageRepo as any).findNewer.calledOnce).to.be.true;
      expect(result.prevCursor).to.be.null;
      expect(decode(result.nextCursor)).to.include({ id: "m-6", d: "older" });
    });

    it("around — окно с курсорами в обе стороны", async () => {
      (messageRepo as any).findAround.resolves({
        messages: [
          makeMessageEntity({ id: "m-3", createdAt: at("2026-01-03") }),
          makeMessageEntity({ id: "m-2", createdAt: at("2026-01-02") }),
          makeMessageEntity({ id: "m-1", createdAt: at("2026-01-01") }),
        ],
        hasOlder: true,
        hasNewer: true,
      });

      const result = await service.getMessages(chatId, userId, {
        around: "m-2",
        limit: 3,
      });

      expect(
        (messageRepo as any).findAround.calledOnceWith(
          chatId,
          userId,
          "m-2",
          3,
        ),
      ).to.be.true;
      expect(decode(result.nextCursor)).to.include({ id: "m-1", d: "older" });
      expect(decode(result.prevCursor)).to.include({ id: "m-3", d: "newer" });
    });

    it("around: сообщения нет в чате — MESSAGE_NOT_FOUND", async () => {
      const err = await service
        .getMessages(chatId, userId, { around: "missing" })
        .catch(e => e);

      expect(err).to.have.property("code", "MESSAGE_NOT_FOUND");
    });

    it("испорченный курсор — MESSAGE_INVALID_CURSOR", async () => {
      for (const cursor of [
        "not-base64-json",
        Buffer.from(JSON.stringify({ t: "x", id: "m", d: "older" })).toString(
          "base64url",
        ),
        Buffer.from(
          JSON.stringify({ t: "2026-01-01", id: "m", d: "sideways" }),
        ).toString("base64url"),
      ]) {
        const err = await service
          .getMessages(chatId, userId, { cursor })
          .catch(e => e);

        expect(err).to.have.property("code", "MESSAGE_INVALID_CURSOR");
      }
    });

    it("limit ограничен сверху 100", async () => {
      await service.getMessages(chatId, userId, { limit: 1000 });

      expect((messageRepo as any).findOlder.firstCall.args[3]).to.equal(100);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getMessages(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  // ───── editMessage ─────

  describe("editMessage", () => {
    it("should update content and set isEdited=true for own message", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById
        .onFirstCall()
        .resolves(msg)
        .onSecondCall()
        .resolves({ ...msg, content: "Updated", isEdited: true });

      await service.editMessage(messageId, userId, "Updated");

      expect(messageRepo.save.calledOnce).to.be.true;
      expect(msg.content).to.equal("Updated");
      expect(msg.isEdited).to.be.true;
      expect(eventBus.emit.called).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageUpdatedEvent,
      );
    });

    it("should throw ForbiddenException when editing other's message", async () => {
      (messageRepo as any).findById.resolves(
        makeMessageEntity({ senderId: otherUserId }),
      );

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });

    it("should throw BadRequestException when editing deleted message", async () => {
      (messageRepo as any).findById.resolves(
        makeMessageEntity({ isDeleted: true }),
      );

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── deleteMessage ─────

  describe("deleteMessage", () => {
    it("should soft delete own message for all (isDeleted=true)", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById.resolves(msg);

      await service.deleteMessage(messageId, userId, true);

      expect(msg.isDeleted).to.be.true;
      expect((messageRepo as any).markDeleted.calledOnceWith(messageId)).to.be
        .true;
      // Непрочитавшим участникам счётчик уменьшается
      expect(
        (memberRepo as any).decrementUnreadForDeletedMessage.calledOnceWith(
          chatId,
          userId,
          msg.createdAt,
        ),
      ).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageDeletedEvent,
      );
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

      await service.deleteMessage(messageId, userId, true);

      expect(msg.isDeleted).to.be.true;
      expect((messageRepo as any).markDeleted.calledOnce).to.be.true;
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
        await service.deleteMessage(messageId, userId, true);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.deleteMessage(messageId, userId, true);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });

    it("should throw ForbiddenException when non-member tries to delete others' messages", async () => {
      const msg = makeMessageEntity({ senderId: otherUserId });

      (messageRepo as any).findById.resolves(msg);
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.deleteMessage(messageId, userId, true);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  // ───── pinMessage ─────

  describe("pinMessage", () => {
    it("should pin message when user is admin/owner and emit event", async () => {
      const msg = makeMessageEntity();

      (messageRepo as any).findById
        .onFirstCall()
        .resolves(msg)
        .onSecondCall()
        .resolves({
          ...msg,
          isPinned: true,
          pinnedAt: new Date(),
          pinnedById: userId,
        });
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.ADMIN,
      });

      await service.pinMessage(messageId, userId);

      expect(msg.isPinned).to.be.true;
      expect(msg.pinnedById).to.equal(userId);
      expect(messageRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessagePinnedEvent,
      );
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.pinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── unpinMessage ─────

  describe("unpinMessage", () => {
    it("should unpin message when user is admin/owner", async () => {
      const msg = makeMessageEntity({
        isPinned: true,
        pinnedAt: new Date(),
        pinnedById: userId,
      });

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
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageUnpinnedEvent,
      );
    });
  });

  // ───── pin/unpin: доступ ─────

  describe("pin/unpin: посторонний пользователь", () => {
    beforeEach(() => {
      (messageRepo as any).findById.resolves(makeMessageEntity());
      (memberRepo as any).findMembership.resolves(null);
    });

    it("не может закрепить сообщение в чужом чате", async () => {
      try {
        await service.pinMessage(messageId, "stranger");
        expect.fail("should throw");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }

      expect(messageRepo.save.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("не может открепить сообщение в чужом чате", async () => {
      try {
        await service.unpinMessage(messageId, "stranger");
        expect.fail("should throw");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }

      expect(messageRepo.save.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
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
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageReactionEvent,
      );
    });

    it("should update existing reaction", async () => {
      const existingReaction = {
        id: "react-1",
        messageId,
        userId,
        emoji: "thumbsup",
      };

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
        expect(err).to.have.property("status", 403);
      }
    });

    it("should throw NotFoundException when message does not exist", async () => {
      (messageRepo as any).findById.resolves(null);

      try {
        await service.addReaction(messageId, userId, "thumbsup");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── removeReaction ─────

  describe("removeReaction", () => {
    it("should remove existing reaction and emit event", async () => {
      const existingReaction = {
        id: "react-1",
        messageId,
        userId,
        emoji: "thumbsup",
      };

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
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── markAsDelivered ─────

  describe("markAsDelivered", () => {
    it("should update status to DELIVERED and emit event", async () => {
      chatService.isMember.resolves(true);
      // Свои сообщения не считаются доставленными — только чужие
      messageRepo.find.resolves([
        { id: "msg-1", senderId: otherUserId },
        { id: "msg-2", senderId: userId },
      ]);
      const em = stubTransaction();

      await service.markAsDelivered(chatId, userId, ["msg-1", "msg-2"]);

      expect(
        receiptRepo.upsertReceipts.calledOnceWith(
          chatId,
          userId,
          ["msg-1"],
          EMessageStatus.DELIVERED,
        ),
      ).to.be.true;
      expect(em.createQueryBuilder.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(MessageDeliveredEvent);
      expect(event.messageIds).to.deep.equal(["msg-1"]);
    });

    it("не участник чата — 403", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.markAsDelivered(chatId, userId, ["msg-1"]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }

      expect(messageRepo.withTransaction.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("should do nothing when all messages are own", async () => {
      chatService.isMember.resolves(true);
      messageRepo.find.resolves([{ id: "msg-1", senderId: userId }]);

      await service.markAsDelivered(chatId, userId, ["msg-1"]);

      expect(messageRepo.withTransaction.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });
  });

  // ───── markAsRead ─────

  describe("markAsRead", () => {
    const readMsg = {
      id: messageId,
      senderId: otherUserId,
      createdAt: new Date(),
    };

    it("уменьшает счётчик атомарно на число реально новых прочтений", async () => {
      messageRepo.find.resolves([readMsg]);
      receiptRepo.upsertReceipts.resolves([messageId]);
      const em = stubTransaction();

      await service.markAsRead(chatId, userId, [messageId]);

      expect(receiptRepo.upsertReceipts.calledOnce).to.be.true;
      expect(
        receiptRepo.upsertReceipts.firstCall.args.slice(0, 4),
      ).to.deep.equal([chatId, userId, [messageId], EMessageStatus.READ]);
      // Счётчик меняется в БД одним UPDATE с GREATEST, а не read-modify-write
      expect(em.save.called).to.be.false;
      expect(em.query.calledOnce).to.be.true;

      const [sql, params] = em.query.firstCall.args;

      expect(sql).to.contain("GREATEST(0, unread_count - $3)");
      expect(params.slice(0, 4)).to.deep.equal([chatId, userId, 1, messageId]);
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        MessageReadEvent,
      );
    });

    it("повтор тех же id ничего не меняет", async () => {
      messageRepo.find.resolves([readMsg]);
      // Все receipts уже в READ — новых прочтений нет
      receiptRepo.upsertReceipts.resolves([]);
      const em = stubTransaction();

      await service.markAsRead(chatId, userId, [messageId]);

      expect(em.query.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("удалённые для всех сообщения не считаются", async () => {
      messageRepo.find.resolves([]);

      await service.markAsRead(chatId, userId, [messageId]);

      expect(messageRepo.find.firstCall.args[0].where).to.include({
        isDeleted: false,
      });
      expect(receiptRepo.upsertReceipts.called).to.be.false;
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.markAsRead(chatId, userId, [messageId]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
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

      expect(result.items).to.have.length(1);
      expect(result).to.include({ total: 1, offset: 0, limit: 20 });
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.searchMessages(chatId, userId, "hello");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  // ───── searchGlobalMessages ─────

  describe("searchGlobalMessages", () => {
    it("should search across all user's chats", async () => {
      (memberRepo as any).getUserChatIds.resolves(["chat-1", "chat-2"]);
      const msgs = [makeMessageEntity()];

      (messageRepo as any).searchGlobal.resolves([msgs, 1]);

      const result = await service.searchGlobalMessages(userId, "hello", 0, 5);

      expect(
        (messageRepo as any).searchGlobal.calledOnceWith(
          ["chat-1", "chat-2"],
          userId,
          "hello",
          0,
          5,
        ),
      ).to.be.true;
      expect(result.items).to.have.length(1);
      expect(result.total).to.equal(1);
    });

    it("should return empty when user has no chats", async () => {
      const result = await service.searchGlobalMessages(userId, "hello");

      expect(result.items).to.have.length(0);
      expect(result.total).to.equal(0);
      expect((messageRepo as any).searchGlobal.called).to.be.false;
    });
  });

  // ───── getPinnedMessages ─────

  describe("getPinnedMessages", () => {
    it("should return pinned messages for a member", async () => {
      chatService.isMember.resolves(true);
      const msgs = [makeMessageEntity({ isPinned: true })];

      (messageRepo as any).findPinnedByChatId.resolves([msgs, 1]);

      const result = await service.getPinnedMessages(chatId, userId);

      expect(
        (messageRepo as any).findPinnedByChatId.calledOnceWith(
          chatId,
          userId,
          0,
          20,
        ),
      ).to.be.true;
      expect(result.items).to.have.length(1);
      expect(result.total).to.equal(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getPinnedMessages(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
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

      expect(result.items).to.have.length(1);
      expect(result.total).to.equal(1);
    });

    it("should throw ForbiddenException for non-member", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.getChatMedia(chatId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
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
        expect(err).to.have.property("status", 403);
      }
    });
  });
  // ───── sendMessage: проверки ввода и прав ─────

  describe("sendMessage: ссылки, вложения, ограничения", () => {
    /** Транзакция sendMessage с раздельными репозиториями по сущности. */
    const stubSendTransaction = (
      files: Array<{
        id: string;
        ownerId: string | null;
        status?: string;
      }> = [],
      attachedCount = 0,
    ) => {
      const saved = makeMessageEntity();
      const fileRepo = createMockRepository();
      const attachmentRepo = createMockRepository();

      fileRepo.find.resolves(files);
      attachmentRepo.count.resolves(attachedCount);

      const em = {
        getRepository: sinon.stub().callsFake((target: unknown) => {
          if (target === File) return fileRepo;
          if (target === MessageAttachment) return attachmentRepo;

          return createMockRepository();
        }),
      };

      messageRepo.withTransaction.callsFake(async (cb: any) =>
        cb(
          {
            create: sinon.stub().returns(saved),
            save: sinon.stub().resolves(saved),
          },
          em,
        ),
      );
      (messageRepo as any).findById.resolves(saved);

      return { em, fileRepo, attachmentRepo };
    };

    const expectReject = async (
      promise: Promise<unknown>,
      type: new (...args: any[]) => Error,
    ) => {
      try {
        await promise;
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", (new type() as any).status);

        return err;
      }
    };

    it("replyToId из другого чата — 400", async () => {
      stubSendTransaction();
      messageRepo.findOne.resolves({
        id: "foreign-msg",
        chatId: "other-chat",
        isDeleted: false,
      });

      await expectReject(
        service.sendMessage(chatId, userId, {
          content: "hi",
          replyToId: "foreign-msg",
        }),
        BadRequestException,
      );
      expect(messageRepo.withTransaction.called).to.be.false;
    });

    it("replyToId из того же чата — ок", async () => {
      stubSendTransaction();
      messageRepo.findOne.resolves({
        id: "same-msg",
        chatId,
        isDeleted: false,
      });

      const result = await service.sendMessage(chatId, userId, {
        content: "hi",
        replyToId: "same-msg",
      });

      expect(result).to.have.property("id", messageId);
    });

    it("forwardedFromId из чата, где отправитель не состоит — 400", async () => {
      stubSendTransaction();
      messageRepo.findOne.resolves({
        id: "secret-msg",
        chatId: "secret-chat",
        isDeleted: false,
      });
      chatService.isMember.withArgs("secret-chat", userId).resolves(false);

      await expectReject(
        service.sendMessage(chatId, userId, {
          content: "fwd",
          forwardedFromId: "secret-msg",
        }),
        BadRequestException,
      );
      expect(messageRepo.withTransaction.called).to.be.false;
    });

    it("вложение: несуществующий файл — 400", async () => {
      stubSendTransaction([]);

      await expectReject(
        service.sendMessage(chatId, userId, { fileIds: ["file-1"] }),
        BadRequestException,
      );
    });

    it("вложение: чужой файл — 400", async () => {
      stubSendTransaction([{ id: "file-1", ownerId: otherUserId }]);

      await expectReject(
        service.sendMessage(chatId, userId, { fileIds: ["file-1"] }),
        BadRequestException,
      );
    });

    it("вложение: файл уже прикреплён к другому сообщению — 400", async () => {
      stubSendTransaction([{ id: "file-1", ownerId: userId }], 1);

      await expectReject(
        service.sendMessage(chatId, userId, { fileIds: ["file-1"] }),
        BadRequestException,
      );
    });

    it("вложение: загрузка не завершена — MESSAGE_ATTACHMENT_NOT_READY", async () => {
      stubSendTransaction([
        { id: "file-1", ownerId: userId, status: EFileStatus.Pending },
      ]);

      const err = await service
        .sendMessage(chatId, userId, { fileIds: ["file-1"] })
        .catch(e => e);

      expect(err).to.have.property("code", "MESSAGE_ATTACHMENT_NOT_READY");
      expect(err.reason).to.deep.equal({ fileIds: ["file-1"] });
    });

    it("вложение: файл ещё обрабатывается — можно прикрепить", async () => {
      stubSendTransaction([
        { id: "file-1", ownerId: userId, status: EFileStatus.Processing },
      ]);

      await service.sendMessage(chatId, userId, { fileIds: ["file-1"] });
    });

    it("вложение: свой свободный файл — ок, дубли id схлопываются", async () => {
      const { fileRepo } = stubSendTransaction([
        { id: "file-1", ownerId: userId },
      ]);

      await service.sendMessage(chatId, userId, {
        fileIds: ["file-1", "file-1"],
      });

      expect(fileRepo.find.calledOnce).to.be.true;
    });

    it("клиент не может отправить служебный тип", async () => {
      stubSendTransaction();

      for (const type of [EMessageType.SYSTEM, EMessageType.POLL]) {
        await expectReject(
          service.sendMessage(chatId, userId, { type, content: "x" }),
          BadRequestException,
        );
      }
    });

    it("slow mode: участник пишет раньше срока — 429 с retryAfter", async () => {
      stubSendTransaction();
      (chatRepo as any).findOne.resolves({
        id: chatId,
        type: EChatType.GROUP,
        slowModeSeconds: 30,
      });
      (messageRepo as any).findLastBySender.resolves({
        id: "prev",
        createdAt: new Date(Date.now() - 10_000),
      });

      const err = (await expectReject(
        service.sendMessage(chatId, userId, { content: "spam" }),
        TooManyRequestsException,
      )) as HttpException;

      expect(err.code).to.equal("MESSAGE_SLOW_MODE");

      const { retryAfter } = err.reason as { retryAfter: number };

      expect(retryAfter).to.be.within(19, 21);
      expect(messageRepo.withTransaction.called).to.be.false;
    });

    it("slow mode: срок прошёл — ок", async () => {
      stubSendTransaction();
      (chatRepo as any).findOne.resolves({
        id: chatId,
        type: EChatType.GROUP,
        slowModeSeconds: 30,
      });
      (messageRepo as any).findLastBySender.resolves({
        id: "prev",
        createdAt: new Date(Date.now() - 31_000),
      });

      await service.sendMessage(chatId, userId, { content: "ok" });
    });

    it("slow mode не действует на ADMIN", async () => {
      stubSendTransaction();
      (chatRepo as any).findOne.resolves({
        id: chatId,
        type: EChatType.GROUP,
        slowModeSeconds: 30,
      });
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role: EChatMemberRole.ADMIN,
      });
      (messageRepo as any).findLastBySender.resolves({
        id: "prev",
        createdAt: new Date(),
      });

      await service.sendMessage(chatId, userId, { content: "ok" });
    });

    it("DIRECT с блокировкой — 403", async () => {
      stubSendTransaction();
      userBlockService.isBlockedEither.resolves(true);

      await expectReject(
        service.sendMessage(chatId, userId, { content: "hi" }),
        ForbiddenException,
      );
      expect(
        userBlockService.isBlockedEither.calledOnceWith(userId, otherUserId),
      ).to.be.true;
      expect(messageRepo.withTransaction.called).to.be.false;
    });

    it("lastMessage чата — условный UPDATE, завершается до эмиссии", async () => {
      stubSendTransaction();
      const qb = createMockQueryBuilder();

      chatRepo.createQueryBuilder.returns(qb);

      await service.sendMessage(chatId, userId, { content: "hi" });

      expect(qb.execute.calledOnce).to.be.true;
      expect(
        qb.andWhere.calledWithMatch(
          "last_message_at IS NULL OR last_message_at <",
        ),
      ).to.be.true;
      expect(chatRepo.update.called).to.be.false;
      expect(qb.execute.calledBefore(eventBus.emit)).to.be.true;
    });

    it("DIRECT: новое сообщение снимает скрытие чата", async () => {
      stubSendTransaction();

      await service.sendMessage(chatId, userId, { content: "hi" });

      expect((memberRepo as any).unhideForChat.calledOnceWith(chatId)).to.be
        .true;
    });
  });

  // ───── editMessage: членство и тип ─────

  describe("editMessage: членство и тип", () => {
    it("бывший участник не может редактировать — 403", async () => {
      chatService.isMember.resolves(false);

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }

      expect(messageRepo.save.called).to.be.false;
    });

    it("редактировать можно только текст — 400", async () => {
      (messageRepo as any).findById.resolves(
        makeMessageEntity({ type: EMessageType.POLL }),
      );

      try {
        await service.editMessage(messageId, userId, "Updated");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });
  });

  // ───── pin: роли ─────

  describe("pin/unpin: права по типу чата", () => {
    const asMember = (role: EChatMemberRole) =>
      (memberRepo as any).findMembership.resolves({
        id: "mem-1",
        chatId,
        userId,
        role,
      });

    it("обычный участник группы не может закрепить — 403", async () => {
      (chatRepo as any).findOne.resolves({ id: chatId, type: EChatType.GROUP });
      asMember(EChatMemberRole.MEMBER);

      try {
        await service.pinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }

      expect(messageRepo.save.called).to.be.false;
    });

    it("обычный участник группы не может открепить — 403", async () => {
      (chatRepo as any).findOne.resolves({ id: chatId, type: EChatType.GROUP });
      asMember(EChatMemberRole.MEMBER);

      try {
        await service.unpinMessage(messageId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });

    it("ADMIN группы закрепляет", async () => {
      (chatRepo as any).findOne.resolves({ id: chatId, type: EChatType.GROUP });
      asMember(EChatMemberRole.ADMIN);

      await service.pinMessage(messageId, userId);

      expect(messageRepo.save.calledOnce).to.be.true;
    });

    it("любой участник DIRECT закрепляет", async () => {
      (chatRepo as any).findOne.resolves({
        id: chatId,
        type: EChatType.DIRECT,
      });
      asMember(EChatMemberRole.MEMBER);

      await service.pinMessage(messageId, userId);

      expect(messageRepo.save.calledOnce).to.be.true;
    });
  });

  // ───── deleteMessage: повтор и опросы ─────

  describe("deleteMessage: повтор и опросы", () => {
    it("повторное удаление для всех — 400, счётчики не трогаются", async () => {
      (messageRepo as any).findById.resolves(
        makeMessageEntity({ isDeleted: true }),
      );

      try {
        await service.deleteMessage(messageId, userId, true);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }

      expect((memberRepo as any).decrementUnreadForDeletedMessage.called).to.be
        .false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("гонка: сообщение уже удалено параллельным запросом — 400", async () => {
      (messageRepo as any).markDeleted.resolves(false);

      try {
        await service.deleteMessage(messageId, userId, true);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }

      expect((memberRepo as any).decrementUnreadForDeletedMessage.called).to.be
        .false;
    });

    it("удаление опроса для всех закрывает опрос", async () => {
      (messageRepo as any).findById.resolves(
        makeMessageEntity({ type: EMessageType.POLL }),
      );

      await service.deleteMessage(messageId, userId, true);

      expect(pollRepo.update.calledOnce).to.be.true;
      expect(pollRepo.update.firstCall.args[0]).to.deep.equal({
        messageId,
        isClosed: false,
      });
      expect(pollRepo.update.firstCall.args[1]).to.include({ isClosed: true });
    });
  });

  // ───── search: ввод ─────

  describe("search: короткий запрос", () => {
    it("меньше 2 символов в чате — 400", async () => {
      try {
        await service.searchMessages(chatId, userId, " a ");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });

    it("меньше 2 символов глобально — 400", async () => {
      try {
        await service.searchGlobalMessages(userId, "a");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });
  });
});
