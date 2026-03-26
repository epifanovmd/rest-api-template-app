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
    it("should broadcast typing event to room", () => {
      const socket = createMockSocket();
      const chatId = "chat-1";
      const emitStub = sinon.stub();

      socket.to.returns({ emit: emitStub });

      handler.onConnection(socket as any);
      socket._handlers["chat:typing"]({ chatId });

      expect(socket.to.calledOnceWith(`chat_${chatId}`)).to.be.true;
      expect(
        emitStub.calledOnceWith("chat:typing", { chatId, userId }),
      ).to.be.true;
    });
  });
});
