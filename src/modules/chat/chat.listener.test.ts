import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockEmitter, uuid, uuid2 } from "../../test/helpers";
import { ChatListener } from "./chat.listener";
import {
  ChatCreatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatUpdatedEvent,
} from "./events";

describe("ChatListener", () => {
  let listener: ChatListener;
  let emitter: ReturnType<typeof createMockEmitter>;
  let eventHandlers: Record<string, Function>;

  const chatId = uuid();
  const userId1 = uuid();
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

    listener = new ChatListener(mockEventBus as any, emitter as any);
    listener.register();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("ChatCreatedEvent", () => {
    it("should emit chat:created to all member user rooms", () => {
      const chat = { id: chatId } as any;
      const memberUserIds = [userId1, userId2];
      const event = new ChatCreatedEvent(chat, memberUserIds);

      eventHandlers["ChatCreatedEvent"](event);

      expect(emitter.toUser.callCount).to.equal(2);
      expect(emitter.toUser.firstCall.args[0]).to.equal(userId1);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:created");
      expect(emitter.toUser.secondCall.args[0]).to.equal(userId2);
    });
  });

  describe("ChatUpdatedEvent", () => {
    it("should emit chat:updated to chat room", () => {
      const chat = { id: chatId } as any;
      const event = new ChatUpdatedEvent(chat);

      eventHandlers["ChatUpdatedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("chat:updated");
    });
  });

  describe("ChatMemberJoinedEvent", () => {
    it("should emit chat:member:joined to all members", () => {
      const memberUserIds = [userId1, userId2];
      const event = new ChatMemberJoinedEvent(chatId, userId2, memberUserIds);

      eventHandlers["ChatMemberJoinedEvent"](event);

      expect(emitter.toUser.callCount).to.equal(2);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:member:joined");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        chatId,
        userId: userId2,
        member: undefined,
      });
    });
  });

  describe("ChatMemberLeftEvent", () => {
    it("should emit chat:member:left to all members", () => {
      const memberUserIds = [userId1, userId2];
      const event = new ChatMemberLeftEvent(chatId, userId1, memberUserIds);

      eventHandlers["ChatMemberLeftEvent"](event);

      expect(emitter.toUser.callCount).to.equal(2);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:member:left");
      expect(emitter.toUser.firstCall.args[2]).to.deep.equal({
        chatId,
        userId: userId1,
      });
    });
  });
});
