import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { ChatHandler } from "./chat.handler";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const C3 = "33333333-3333-4333-8333-333333333333";

describe("ChatHandler", () => {
  let handler: ChatHandler;
  let memberRepo: ReturnType<typeof createMockRepository>;

  const userId = uuid();

  const createMockSocket = () => {
    const handlers: Record<string, Function> = {};

    return {
      on: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
      join: sinon.stub(),
      leave: sinon.stub(),
      to: sinon.stub().returns({ emit: sinon.stub() }),
      emit: sinon.stub(),
      rooms: new Set<string>(),
      data: { userId },
      _handlers: handlers,
    };
  };

  beforeEach(() => {
    memberRepo = createMockRepository();
    (memberRepo as any).findMembership = sinon.stub().resolves(null);
    (memberRepo as any).getMemberUserIds = sinon.stub().resolves([]);
    (memberRepo as any).filterMemberChatIds = sinon
      .stub()
      .callsFake(async (_u: string, ids: string[]) => ids);
    handler = new ChatHandler(memberRepo as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("chat:join", () => {
    it("участник входит в комнату чата, ack ok", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      (memberRepo as any).findMembership.resolves({ id: "m1" });

      handler.onConnection(socket as any);
      await socket._handlers["chat:join"]({ chatId: C1 }, ack);

      expect(socket.join.calledOnceWith(`chat_${C1}`)).to.be.true;
      expect(ack.calledOnceWith({ ok: true })).to.be.true;
    });

    it("не участник — CHAT_NOT_MEMBER, комната не выдаётся", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["chat:join"]({ chatId: C1 }, ack);

      expect(socket.join.called).to.be.false;
      expect(ack.firstCall.args[0].error.code).to.equal("CHAT_NOT_MEMBER");
    });

    it("некорректный chatId — VALIDATION_ERROR без запроса в БД", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["chat:join"]({ chatId: "chat-1" }, ack);

      expect((memberRepo as any).findMembership.called).to.be.false;
      expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
    });
  });

  describe("chat:leave", () => {
    it("выходит из комнаты чата", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["chat:leave"]({ chatId: C1 });

      expect(socket.leave.calledOnceWith(`chat_${C1}`)).to.be.true;
    });
  });

  describe("chat:typing", () => {
    it("рассылает typing в комнату чата и typing-комнату", async () => {
      const socket = createMockSocket();
      const emitStub = sinon.stub();

      socket.to.returns({ emit: emitStub });
      socket.rooms.add(`chat_${C1}`);

      handler.onConnection(socket as any);
      await socket._handlers["chat:typing"]({ chatId: C1 });

      expect(socket.to.calledWith(`chat_${C1}`)).to.be.true;
      expect(socket.to.calledWith(`typing_${C1}`)).to.be.true;
      expect(emitStub.calledWith("chat:typing", { chatId: C1, userId })).to.be
        .true;
    });

    it("не участник — молча, без рассылки и без ошибки", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["chat:typing"]({ chatId: C2 });

      expect(socket.to.called).to.be.false;
      expect(socket.emit.called).to.be.false;
    });

    it("проверяет членство в БД, если комнаты ещё нет", async () => {
      const socket = createMockSocket();

      (memberRepo as any).findMembership.resolves({ id: "m1" });

      handler.onConnection(socket as any);
      await socket._handlers["chat:typing"]({ chatId: C1 });

      expect(socket.to.calledWith(`chat_${C1}`)).to.be.true;
    });

    it("не чаще 2 раз в секунду на сокет", async () => {
      const clock = sinon.useFakeTimers({ now: 5_000 });
      const socket = createMockSocket();

      socket.rooms.add(`chat_${C1}`);
      handler.onConnection(socket as any);

      for (let i = 0; i < 5; i += 1) {
        await socket._handlers["chat:typing"]({ chatId: C1 });
      }

      // Каждое прошедшее событие шлёт в две комнаты
      expect(socket.to.callCount).to.equal(4);

      clock.restore();
    });
  });

  describe("typing:subscribe", () => {
    it("подписывает только на чаты, где пользователь участник", async () => {
      const socket = createMockSocket();

      (memberRepo as any).filterMemberChatIds.resolves([C1]);

      handler.onConnection(socket as any);
      await socket._handlers["typing:subscribe"]({ chatIds: [C1, C2] });

      expect(socket.join.calledWith(`typing_${C1}`)).to.be.true;
      expect(socket.join.calledWith(`typing_${C2}`)).to.be.false;
    });

    it("входит в typing-комнаты переданных чатов", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["typing:subscribe"]({ chatIds: [C1, C2, C3] });

      expect(socket.join.calledWith(`typing_${C1}`)).to.be.true;
      expect(socket.join.calledWith(`typing_${C2}`)).to.be.true;
      expect(socket.join.calledWith(`typing_${C3}`)).to.be.true;
    });

    it("больше 200 чатов — VALIDATION_ERROR", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["typing:subscribe"](
        { chatIds: Array.from({ length: 201 }, () => C1) },
        ack,
      );

      expect(socket.join.called).to.be.false;
      expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
    });
  });

  describe("typing:unsubscribe", () => {
    it("выходит из typing-комнат переданных чатов", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["typing:unsubscribe"]({ chatIds: [C1, C2] });

      expect(socket.leave.calledWith(`typing_${C1}`)).to.be.true;
      expect(socket.leave.calledWith(`typing_${C2}`)).to.be.true;
    });
  });
});
