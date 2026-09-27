import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEmitter,
  createMockFileStorage,
  uuid,
  uuid2,
} from "../../test/helpers";
import { FileUrlService } from "../file";
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
import { MessageListener } from "./message.listener";

describe("MessageListener", () => {
  let listener: MessageListener;
  let emitter: ReturnType<typeof createMockEmitter>;
  let eventHandlers: Record<string, Function>;
  let memberRepo: {
    getMembersUnreadCounts: sinon.SinonStub;
    findMembership: sinon.SinonStub;
  };

  /** Слушатель шлёт события после промисов репозиториев — ждём их. */
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const emptySummary = { delivered: 0, read: 0, total: 0 };

  const chatId = uuid();
  const senderId = uuid();
  const userId2 = uuid2();

  beforeEach(() => {
    emitter = createMockEmitter();
    eventHandlers = {};

    const mockEventBus = {
      on: (EventClass: any, handler: Function) => {
        eventHandlers[EventClass.name] = handler;

        return () => {};
      },
    };

    const mockMessageService = {
      getUnreadCount: sinon.stub().resolves(1),
    };

    const mockReceiptRepo = {
      getReceiptSummary: sinon.stub().resolves(emptySummary),
    };

    memberRepo = {
      getMembersUnreadCounts: sinon.stub().resolves([]),
      findMembership: sinon.stub().resolves({ unreadCount: 0 }),
    };

    listener = new MessageListener(
      mockEventBus as any,
      emitter as any,
      mockMessageService as any,
      mockReceiptRepo as any,
      memberRepo as any,
      new FileUrlService(createMockFileStorage() as any),
    );
    listener.register();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("MessageCreatedEvent", () => {
    it("should emit message:new to chat room and chat:unread to non-sender members", async () => {
      const message = { id: "msg-1", senderId } as any;
      const memberUserIds = [senderId, userId2];
      const event = new MessageCreatedEvent(message, chatId, memberUserIds);

      // Счётчики уже увеличены в sendMessage — слушатель читает их из membership
      memberRepo.getMembersUnreadCounts.resolves([
        { userId: senderId, unreadCount: 0 },
        { userId: userId2, unreadCount: 3 },
      ]);

      eventHandlers["MessageCreatedEvent"](event);
      await flush();

      // message:new to room
      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:new");

      // chat:unread to non-sender only
      expect(emitter.toUser.calledOnce).to.be.true;
      expect(emitter.toUser.firstCall.args[0]).to.equal(userId2);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:unread");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        chatId,
        unreadCount: 3,
      });
    });

    it("опрос из события уходит в message:new вместе с сообщением", async () => {
      const message = { id: "msg-1", senderId, type: "poll" } as any;
      const poll = { id: "poll-1", question: "?" } as any;
      const event = new MessageCreatedEvent(
        message,
        chatId,
        [senderId],
        [],
        false,
        undefined,
        poll,
      );

      eventHandlers["MessageCreatedEvent"](event);
      await flush();

      expect(emitter.toRoom.firstCall.args[2].poll).to.equal(poll);
    });
  });

  describe("MessageUpdatedEvent", () => {
    it("should emit message:updated to chat room", async () => {
      const message = { id: "msg-1" } as any;
      const event = new MessageUpdatedEvent(message, chatId);

      await eventHandlers["MessageUpdatedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:updated");
    });
  });

  it("вложения в событии уходят с подписанными ссылками", async () => {
    const message = {
      id: "msg-1",
      attachments: [
        {
          id: "a-1",
          fileId: "f-1",
          file: { id: "f-1", key: "files/f-1/o.png", status: "ready" },
        },
      ],
    } as any;

    await eventHandlers["MessageUpdatedEvent"](
      new MessageUpdatedEvent(message, chatId),
    );

    expect(emitter.toRoom.firstCall.args[2].attachments[0].fileUrl).to.equal(
      "https://files.test/files/f-1/o.png?sig=x",
    );
  });

  describe("MessageDeletedEvent", () => {
    it("should emit message:deleted to chat room when forAll=true", () => {
      const messageId = "msg-1";
      const event = new MessageDeletedEvent(messageId, chatId, true, senderId);

      eventHandlers["MessageDeletedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:deleted");
      expect(emitter.toRoom.firstCall.args[2]).to.deep.equal({
        messageId,
        chatId,
        forAll: true,
      });
    });

    it("should emit message:deleted to user only when forAll=false", () => {
      const messageId = "msg-1";
      const event = new MessageDeletedEvent(messageId, chatId, false, senderId);

      eventHandlers["MessageDeletedEvent"](event);

      expect(emitter.toUser.calledOnce).to.be.true;
      expect(emitter.toUser.firstCall.args[0]).to.equal(senderId);
      expect(emitter.toUser.firstCall.args[1]).to.equal("message:deleted");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        messageId,
        chatId,
        forAll: false,
      });
    });
  });

  describe("MessagePinnedEvent", () => {
    it("should emit message:pinned to chat room", async () => {
      const message = { id: "msg-1" } as any;
      const event = new MessagePinnedEvent(message, chatId, senderId);

      await eventHandlers["MessagePinnedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:pinned");
    });
  });

  describe("MessageUnpinnedEvent", () => {
    it("should emit message:unpinned to chat room", () => {
      const messageId = "msg-1";
      const event = new MessageUnpinnedEvent(messageId, chatId);

      eventHandlers["MessageUnpinnedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:unpinned");
      expect(emitter.toRoom.firstCall.args[2]).to.deep.equal({
        messageId,
        chatId,
      });
    });
  });

  describe("MessageReactionEvent", () => {
    it("should emit message:reaction to chat room", () => {
      const messageId = "msg-1";
      const emoji = "thumbsup";
      const event = new MessageReactionEvent(
        messageId,
        chatId,
        senderId,
        emoji,
      );

      eventHandlers["MessageReactionEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:reaction");
      expect(emitter.toRoom.firstCall.args[2]).to.deep.equal({
        messageId,
        chatId,
        userId: senderId,
        emoji,
      });
    });
  });

  describe("MessageDeliveredEvent", () => {
    it("should emit message:status for each message id", async () => {
      const messageIds = ["msg-1", "msg-2", "msg-3"];
      const event = new MessageDeliveredEvent(messageIds, chatId, userId2);

      eventHandlers["MessageDeliveredEvent"](event);
      await flush();

      expect(emitter.toRoom.callCount).to.equal(3);
      for (let i = 0; i < messageIds.length; i += 1) {
        expect(emitter.toRoom.getCall(i).args[0]).to.equal(`chat_${chatId}`);
        expect(emitter.toRoom.getCall(i).args[1]).to.equal("message:status");
        expect(emitter.toRoom.getCall(i).args[2]).to.deep.equal({
          messageId: messageIds[i],
          chatId,
          status: "delivered",
          userId: userId2,
          receiptSummary: emptySummary,
        });
      }
    });
  });

  describe("MessageReadEvent", () => {
    it("should emit chat:unread to user and message:status to the room", async () => {
      const messageIds = ["msg-1"];
      const event = new MessageReadEvent(chatId, userId2, messageIds);

      memberRepo.findMembership.resolves({ unreadCount: 2 });

      eventHandlers["MessageReadEvent"](event);
      await flush();

      expect(emitter.toUser.calledOnce).to.be.true;
      expect(emitter.toUser.firstCall.args[0]).to.equal(userId2);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:unread");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        chatId,
        unreadCount: 2,
      });

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:status");
      expect(emitter.toRoom.firstCall.args[2]).to.include({
        messageId: "msg-1",
        chatId,
        status: "read",
        userId: userId2,
      });
    });
  });
});
