import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockRepository,
} from "../../test/helpers";
import { MessageSchedulerBootstrap } from "./message-scheduler.bootstrap";

describe("MessageSchedulerBootstrap", () => {
  let bootstrap: MessageSchedulerBootstrap;
  let messageRepo: ReturnType<typeof createMockRepository>;
  let chatService: any;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sinon.useFakeTimers();
    messageRepo = createMockRepository();
    chatService = {
      getMemberUserIds: sinon.stub().resolves(["user-1", "user-2"]),
    };
    eventBus = createMockEventBus();

    bootstrap = new MessageSchedulerBootstrap(
      messageRepo as any,
      chatService as any,
      eventBus as any,
    );
  });

  afterEach(() => {
    clock.restore();
    sandbox.restore();
  });

  describe("initialize", () => {
    it("sets up interval", async () => {
      await bootstrap.initialize();

      // Verify interval is set by checking that tick triggers repo calls
      messageRepo.find.resolves([]);
      await clock.tickAsync(10_000);

      expect(messageRepo.find.called).to.be.true;

      await bootstrap.destroy();
    });
  });

  describe("destroy", () => {
    it("clears interval", async () => {
      await bootstrap.initialize();
      await bootstrap.destroy();

      messageRepo.find.resetHistory();
      await clock.tickAsync(10_000);

      // After destroy, find should not be called again
      expect(messageRepo.find.called).to.be.false;
    });
  });

  describe("processScheduledMessages (via interval)", () => {
    it("finds due messages, sets isScheduled=false, emits event", async () => {
      const scheduledMessage = {
        id: "msg-1",
        chatId: "chat-1",
        isScheduled: true,
        sender: { profile: {} },
        replyTo: null,
        attachments: [],
        reactions: [],
      };

      // First call returns scheduled messages, second call (self-destruct) returns empty
      messageRepo.find
        .onFirstCall()
        .resolves([scheduledMessage])
        .onSecondCall()
        .resolves([]);
      messageRepo.save.resolves(scheduledMessage);

      await bootstrap.initialize();
      await clock.tickAsync(10_000);

      expect(messageRepo.save.calledOnce).to.be.true;
      const savedMessage = messageRepo.save.firstCall.args[0];

      expect(savedMessage.isScheduled).to.be.false;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(chatService.getMemberUserIds.calledWith("chat-1")).to.be.true;

      await bootstrap.destroy();
    });

    it("no scheduled messages is a no-op", async () => {
      messageRepo.find.resolves([]);

      await bootstrap.initialize();
      await clock.tickAsync(10_000);

      expect(messageRepo.save.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;

      await bootstrap.destroy();
    });
  });

  describe("processSelfDestructMessages (via interval)", () => {
    it("finds expired messages, soft deletes, emits event", async () => {
      const expiredMessage = {
        id: "msg-2",
        chatId: "chat-2",
        isDeleted: false,
        content: "secret message",
        selfDestructAt: new Date(Date.now() - 1000),
      };

      // First call (scheduled) returns empty, second call (self-destruct) returns expired
      messageRepo.find
        .onFirstCall()
        .resolves([])
        .onSecondCall()
        .resolves([expiredMessage]);
      messageRepo.save.resolves(expiredMessage);

      await bootstrap.initialize();
      await clock.tickAsync(10_000);

      expect(messageRepo.save.calledOnce).to.be.true;
      const savedMessage = messageRepo.save.firstCall.args[0];

      expect(savedMessage.isDeleted).to.be.true;
      expect(savedMessage.content).to.be.null;
      expect(eventBus.emit.calledOnce).to.be.true;

      await bootstrap.destroy();
    });

    it("no expired messages is a no-op", async () => {
      messageRepo.find.resolves([]);

      await bootstrap.initialize();
      await clock.tickAsync(10_000);

      expect(messageRepo.save.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;

      await bootstrap.destroy();
    });
  });
});
