import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockEmitter, uuid, uuid2 } from "../../test/helpers";
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

    listener = new MessageListener(mockEventBus as any, emitter as any);
    listener.register();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("MessageCreatedEvent", () => {
    it("should emit message:new to chat room and chat:unread to non-sender members", () => {
      const message = { id: "msg-1", senderId } as any;
      const memberUserIds = [senderId, userId2];
      const event = new MessageCreatedEvent(message, chatId, memberUserIds);

      eventHandlers["MessageCreatedEvent"](event);

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
        unreadCount: -1,
      });
    });
  });

  describe("MessageUpdatedEvent", () => {
    it("should emit message:updated to chat room", () => {
      const message = { id: "msg-1" } as any;
      const event = new MessageUpdatedEvent(message, chatId);

      eventHandlers["MessageUpdatedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:updated");
    });
  });

  describe("MessageDeletedEvent", () => {
    it("should emit message:deleted to chat room", () => {
      const messageId = "msg-1";
      const event = new MessageDeletedEvent(messageId, chatId);

      eventHandlers["MessageDeletedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("message:deleted");
      expect(emitter.toRoom.firstCall.args[2]).to.deep.equal({
        messageId,
        chatId,
      });
    });
  });

  describe("MessagePinnedEvent", () => {
    it("should emit message:pinned to chat room", () => {
      const message = { id: "msg-1" } as any;
      const event = new MessagePinnedEvent(message, chatId, senderId);

      eventHandlers["MessagePinnedEvent"](event);

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
    it("should emit message:status for each message id", () => {
      const messageIds = ["msg-1", "msg-2", "msg-3"];
      const event = new MessageDeliveredEvent(messageIds, chatId, userId2);

      eventHandlers["MessageDeliveredEvent"](event);

      expect(emitter.toRoom.callCount).to.equal(3);
      for (let i = 0; i < messageIds.length; i += 1) {
        expect(emitter.toRoom.getCall(i).args[0]).to.equal(`chat_${chatId}`);
        expect(emitter.toRoom.getCall(i).args[1]).to.equal("message:status");
        expect(emitter.toRoom.getCall(i).args[2]).to.deep.equal({
          messageId: messageIds[i],
          chatId,
          status: "delivered",
        });
      }
    });
  });

  describe("MessageReadEvent", () => {
    it("should emit chat:unread to user", () => {
      const messageId = "msg-1";
      const event = new MessageReadEvent(chatId, userId2, messageId);

      eventHandlers["MessageReadEvent"](event);

      expect(emitter.toUser.calledOnce).to.be.true;
      expect(emitter.toUser.firstCall.args[0]).to.equal(userId2);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:unread");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        chatId,
        unreadCount: 0,
      });
    });
  });
});
