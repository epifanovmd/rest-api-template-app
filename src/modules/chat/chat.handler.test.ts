import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { ChatHandler } from "./chat.handler";

describe("ChatHandler", () => {
  let handler: ChatHandler;
  let memberRepo: ReturnType<typeof createMockRepository>;

  const userId = uuid();

  const createMockSocket = () => {
    const handlers: Record<string, Function> = {};

    return {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      join: sinon.stub(),
      leave: sinon.stub(),
      to: sinon.stub().returns({ emit: sinon.stub() }),
      data: { userId },
      _handlers: handlers,
    };
  };

  beforeEach(() => {
    memberRepo = createMockRepository();
    (memberRepo as any).findMembership = sinon.stub().resolves(null);
    (memberRepo as any).getMemberUserIds = sinon.stub().resolves([]);
    handler = new ChatHandler(memberRepo as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("chat:join", () => {
    it("should join socket room when user is a member", async () => {
      const socket = createMockSocket();
      const chatId = "chat-1";

      (memberRepo as any).findMembership.resolves({ id: "m1" });

      handler.onConnection(socket as any);
      await socket._handlers["chat:join"]({ chatId });

      expect(socket.join.calledOnceWith(`chat_${chatId}`)).to.be.true;
    });

    it("should NOT join socket room when user is not a member", async () => {
      const socket = createMockSocket();
      const chatId = "chat-1";

      (memberRepo as any).findMembership.resolves(null);

      handler.onConnection(socket as any);
      await socket._handlers["chat:join"]({ chatId });

      expect(socket.join.called).to.be.false;
    });
  });

  describe("chat:leave", () => {
    it("should leave socket room", () => {
      const socket = createMockSocket();
      const chatId = "chat-1";

      handler.onConnection(socket as any);
      socket._handlers["chat:leave"]({ chatId });

      expect(socket.leave.calledOnceWith(`chat_${chatId}`)).to.be.true;
    });
  });

  describe("chat:typing", () => {
    it("should broadcast typing to both chat and typing rooms", () => {
      const socket = createMockSocket();
      const chatId = "chat-1";
      const emitStub = sinon.stub();

      socket.to.returns({ emit: emitStub });

      handler.onConnection(socket as any);
      socket._handlers["chat:typing"]({ chatId });

      // Should emit to chat room
      expect(socket.to.calledWith(`chat_${chatId}`)).to.be.true;
      // Should emit to typing room
      expect(socket.to.calledWith(`typing_${chatId}`)).to.be.true;
      // Payload should contain chatId and userId
      expect(
        emitStub.calledWith("chat:typing", { chatId, userId }),
      ).to.be.true;
    });
  });

  describe("typing:subscribe", () => {
    it("should join typing rooms for given chat IDs", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["typing:subscribe"]({
        chatIds: ["c1", "c2", "c3"],
      });

      expect(socket.join.calledWith("typing_c1")).to.be.true;
      expect(socket.join.calledWith("typing_c2")).to.be.true;
      expect(socket.join.calledWith("typing_c3")).to.be.true;
    });
  });

  describe("typing:unsubscribe", () => {
    it("should leave typing rooms for given chat IDs", () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      socket._handlers["typing:unsubscribe"]({ chatIds: ["c1", "c2"] });

      expect(socket.leave.calledWith("typing_c1")).to.be.true;
      expect(socket.leave.calledWith("typing_c2")).to.be.true;
    });
  });
});
