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
import { UserDeletedEvent } from "../user";
import { ChatListener } from "./chat.listener";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatUpdatedEvent,
} from "./events";

describe("ChatListener", () => {
  let listener: ChatListener;
  let emitter: ReturnType<typeof createMockEmitter> & {
    joinRoom: sinon.SinonStub;
    leaveRoom: sinon.SinonStub;
  };
  let chatService: { handleUserDeleted: sinon.SinonStub };
  let eventHandlers: Record<string, Function>;

  const chatId = uuid();
  const userId1 = uuid();
  const userId2 = uuid2();

  beforeEach(() => {
    emitter = {
      ...createMockEmitter(),
      joinRoom: sinon.stub(),
      leaveRoom: sinon.stub(),
    };
    chatService = { handleUserDeleted: sinon.stub().resolves() };
    eventHandlers = {};

    const mockEventBus = {
      on: (EventClass: any, handler: Function) => {
        eventHandlers[EventClass.name] = handler;

        return () => {};
      },
    };

    listener = new ChatListener(
      mockEventBus as any,
      emitter as any,
      chatService as any,
      new FileUrlService(createMockFileStorage() as any),
    );
    listener.register();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("ChatCreatedEvent", () => {
    it("should emit chat:created to all member user rooms", async () => {
      const chat = { id: chatId } as any;
      const memberUserIds = [userId1, userId2];
      const event = new ChatCreatedEvent(chat, memberUserIds);

      await eventHandlers["ChatCreatedEvent"](event);

      expect(emitter.toUser.callCount).to.equal(2);
      expect(emitter.toUser.firstCall.args[0]).to.equal(userId1);
      expect(emitter.toUser.firstCall.args[1]).to.equal("chat:created");
      expect(emitter.toUser.secondCall.args[0]).to.equal(userId2);
    });
  });

  describe("ChatUpdatedEvent", () => {
    it("should emit chat:updated to chat room", async () => {
      const chat = { id: chatId } as any;
      const event = new ChatUpdatedEvent(chat);

      await eventHandlers["ChatUpdatedEvent"](event);

      expect(emitter.toRoom.calledOnce).to.be.true;
      expect(emitter.toRoom.firstCall.args[0]).to.equal(`chat_${chatId}`);
      expect(emitter.toRoom.firstCall.args[1]).to.equal("chat:updated");
    });

    it("аватар чата уходит подписанной ссылкой хранилища", async () => {
      const chat = {
        id: chatId,
        avatar: { id: "f-1", key: "files/f-1/a.webp", status: "ready" },
      } as any;

      await eventHandlers["ChatUpdatedEvent"](new ChatUpdatedEvent(chat));

      expect(emitter.toRoom.firstCall.args[2].avatarUrl).to.equal(
        "https://files.test/files/f-1/a.webp?sig=x",
      );
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

  describe("комнаты сокетов", () => {
    it("ChatCreatedEvent — участники входят в комнаты чата", () => {
      eventHandlers["ChatCreatedEvent"](
        new ChatCreatedEvent({ id: chatId } as any, [userId1, userId2]),
      );

      expect(emitter.joinRoom.calledWith(userId2, `chat_${chatId}`)).to.be.true;
      expect(emitter.joinRoom.calledWith(userId2, `typing_${chatId}`)).to.be
        .true;
    });

    it("ChatMemberJoinedEvent — новый участник входит в комнаты", () => {
      eventHandlers["ChatMemberJoinedEvent"](
        new ChatMemberJoinedEvent(chatId, userId2, [userId1, userId2]),
      );

      expect(emitter.joinRoom.calledWith(userId2, `chat_${chatId}`)).to.be.true;
      expect(emitter.joinRoom.calledWith(userId2, `typing_${chatId}`)).to.be
        .true;
    });

    it("ChatMemberLeftEvent — ушедший покидает комнаты", () => {
      eventHandlers["ChatMemberLeftEvent"](
        new ChatMemberLeftEvent(chatId, userId2, [userId1, userId2]),
      );

      expect(emitter.leaveRoom.calledWith(userId2, `chat_${chatId}`)).to.be
        .true;
      expect(emitter.leaveRoom.calledWith(userId2, `typing_${chatId}`)).to.be
        .true;
      expect(emitter.leaveRoom.calledWith(userId1)).to.be.false;
    });

    it("ChatDeletedEvent — все участники покидают комнаты и уведомляются", () => {
      eventHandlers["ChatDeletedEvent"](
        new ChatDeletedEvent(chatId, [userId1, userId2], userId1),
      );

      expect(emitter.leaveRoom.calledWith(userId1, `chat_${chatId}`)).to.be
        .true;
      expect(emitter.leaveRoom.calledWith(userId2, `typing_${chatId}`)).to.be
        .true;
      expect(emitter.toUser.calledWith(userId2, "chat:deleted", { chatId })).to
        .be.true;
    });
  });

  describe("UserDeletedEvent", () => {
    it("передаёт обработку сервису", () => {
      eventHandlers["UserDeletedEvent"](new UserDeletedEvent(userId2));

      expect(chatService.handleUserDeleted.calledOnceWith(userId2)).to.be.true;
    });
  });
});
