import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { defineErrors, logger } from "../../core";
import { uuid } from "../../test/helpers";
import { MessageHandler } from "./message.handler";

const CHAT = "11111111-1111-4111-8111-111111111111";
const M1 = "22222222-2222-4222-8222-222222222222";
const M2 = "33333333-3333-4333-8333-333333333333";

describe("MessageHandler", () => {
  let handler: MessageHandler;
  let messageService: any;

  const userId = uuid();

  const createMockSocket = () => {
    const handlers: Record<string, Function> = {};

    return {
      on: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
      emit: sinon.stub(),
      data: { userId },
      _handlers: handlers,
    };
  };

  beforeEach(() => {
    messageService = {
      markAsRead: sinon.stub().resolves(),
      markAsDelivered: sinon.stub().resolves(),
    };
    handler = new MessageHandler(messageService as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("message:read", () => {
    it("messageIds передаются в markAsRead, ack ok", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["message:read"](
        { chatId: CHAT, messageIds: [M1, M2] },
        ack,
      );

      expect(messageService.markAsRead.calledOnceWith(CHAT, userId, [M1, M2]))
        .to.be.true;
      expect(ack.calledOnceWith({ ok: true })).to.be.true;
    });

    it("старый формат: одиночный messageId разворачивается в массив", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["message:read"]({ chatId: CHAT, messageId: M1 });

      expect(messageService.markAsRead.calledOnceWith(CHAT, userId, [M1])).to.be
        .true;
    });

    it("некорректные id — VALIDATION_ERROR, сервис не вызывается", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["message:read"](
        { chatId: "chat-1", messageIds: ["msg-1"] },
        ack,
      );

      expect(messageService.markAsRead.called).to.be.false;
      expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
    });

    it("больше 200 id — VALIDATION_ERROR", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);
      await socket._handlers["message:read"](
        { chatId: CHAT, messageIds: Array.from({ length: 201 }, () => M1) },
        ack,
      );

      expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
    });

    it("доменная ошибка сервиса — её код в ack", async () => {
      const socket = createMockSocket();
      const ack = sinon.stub();
      const TestError = defineErrors("CHAT", {
        NOT_MEMBER: { status: 403, message: "Не участник" },
      });

      messageService.markAsRead.rejects(TestError.NOT_MEMBER());

      handler.onConnection(socket as any);
      await socket._handlers["message:read"](
        { chatId: CHAT, messageIds: [M1] },
        ack,
      );

      expect(ack.firstCall.args[0]).to.deep.equal({
        ok: false,
        error: { code: "CHAT_NOT_MEMBER", message: "Не участник" },
      });
    });

    it("не чаще 10 раз в секунду на сокет", async () => {
      const clock = sinon.useFakeTimers({ now: 10_000 });
      const socket = createMockSocket();
      const ack = sinon.stub();

      handler.onConnection(socket as any);

      for (let i = 0; i < 11; i += 1) {
        await socket._handlers["message:read"](
          { chatId: CHAT, messageIds: [M1] },
          ack,
        );
      }

      expect(messageService.markAsRead.callCount).to.equal(10);
      expect(ack.lastCall.args[0].error.code).to.equal("SOCKET_RATE_LIMITED");

      clock.restore();
    });
  });

  describe("message:delivered", () => {
    it("messageIds передаются в markAsDelivered", async () => {
      const socket = createMockSocket();

      handler.onConnection(socket as any);
      await socket._handlers["message:delivered"]({
        chatId: CHAT,
        messageIds: [M1, M2],
      });

      expect(
        messageService.markAsDelivered.calledOnceWith(CHAT, userId, [M1, M2]),
      ).to.be.true;
    });

    it("без ack ошибка сервиса уходит событием error", async () => {
      const socket = createMockSocket();

      sinon.stub(logger, "error");
      messageService.markAsDelivered.rejects(new Error("fail"));

      handler.onConnection(socket as any);
      await socket._handlers["message:delivered"]({
        chatId: CHAT,
        messageIds: [M1],
      });

      expect(socket.emit.calledOnce).to.be.true;
      expect(socket.emit.firstCall.args[1]).to.include({
        event: "message:delivered",
        code: "SOCKET_INTERNAL",
      });
    });
  });
});
