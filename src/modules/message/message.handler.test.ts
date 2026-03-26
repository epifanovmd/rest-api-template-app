import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { uuid } from "../../test/helpers";
import { MessageHandler } from "./message.handler";

describe("MessageHandler", () => {
  let handler: MessageHandler;
  let messageService: any;

  const userId = uuid();

  const createMockSocket = () => {
    const handlers: Record<string, Function> = {};

    return {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
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
    it("should call markAsRead with correct arguments", async () => {
      const socket = createMockSocket();
      const chatId = "chat-1";
      const messageId = "msg-1";

      handler.onConnection(socket as any);
      await socket._handlers["message:read"]({ chatId, messageId });

      expect(
        messageService.markAsRead.calledOnceWith(chatId, userId, messageId),
      ).to.be.true;
    });

    it("should swallow errors", async () => {
      const socket = createMockSocket();

      messageService.markAsRead.rejects(new Error("fail"));

      handler.onConnection(socket as any);
      // Should not throw
      await socket._handlers["message:read"]({
        chatId: "chat-1",
        messageId: "msg-1",
      });

      expect(messageService.markAsRead.calledOnce).to.be.true;
    });
  });

  describe("message:delivered", () => {
    it("should call markAsDelivered with correct arguments", async () => {
      const socket = createMockSocket();
      const chatId = "chat-1";
      const messageIds = ["msg-1", "msg-2"];

      handler.onConnection(socket as any);
      await socket._handlers["message:delivered"]({ chatId, messageIds });

      expect(
        messageService.markAsDelivered.calledOnceWith(
          chatId,
          userId,
          messageIds,
        ),
      ).to.be.true;
    });

    it("should swallow errors", async () => {
      const socket = createMockSocket();

      messageService.markAsDelivered.rejects(new Error("fail"));

      handler.onConnection(socket as any);
      await socket._handlers["message:delivered"]({
        chatId: "chat-1",
        messageIds: ["msg-1"],
      });

      expect(messageService.markAsDelivered.calledOnce).to.be.true;
    });
  });
});
