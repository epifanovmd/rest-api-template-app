import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { uuid, uuid2, uuid3 } from "../../test/helpers";
import { ContactRequestEvent } from "../contact/events";
import { MessageCreatedEvent } from "../message/events";
import { PushListener } from "./push.listener";

describe("PushListener", () => {
  let listener: PushListener;
  let pushService: any;
  let clientRegistry: any;
  let memberRepo: any;
  let eventHandlers: Record<string, Function>;

  const senderId = uuid();
  const offlineUserId = uuid2();
  const mutedUserId = uuid3();
  const chatId = "chat-1";

  beforeEach(() => {
    pushService = {
      sendToUsers: sinon.stub().resolves(),
      sendToUser: sinon.stub().resolves(),
    };

    clientRegistry = {
      isOnline: sinon.stub().returns(false),
    };

    memberRepo = {
      findMembership: sinon.stub().resolves(null),
      findMembershipsByChat: sinon.stub().resolves([]),
    };

    eventHandlers = {};

    const mockEventBus = {
      on: (EventClass: any, handler: Function) => {
        eventHandlers[EventClass.name] = handler;

        return () => {};
      },
    };

    listener = new PushListener(
      mockEventBus as any,
      pushService as any,
      clientRegistry as any,
      memberRepo as any,
      { emitToUser: sinon.stub() } as any,
    );
    listener.register();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("MessageCreatedEvent", () => {
    it("should send push to offline non-muted users", async () => {
      const message = {
        id: "msg-1",
        senderId,
        content: "Hello world",
        sender: { profile: { firstName: "John" } },
      } as any;
      const memberUserIds = [senderId, offlineUserId];

      // sender is online, offlineUserId is offline
      clientRegistry.isOnline.withArgs(senderId).returns(true);
      clientRegistry.isOnline.withArgs(offlineUserId).returns(false);
      // Not muted — batch returns memberships without active mute
      memberRepo.findMembershipsByChat.resolves([
        { userId: offlineUserId, mutedUntil: null },
      ]);

      const event = new MessageCreatedEvent(message, chatId, memberUserIds);

      await eventHandlers["MessageCreatedEvent"](event);

      expect(pushService.sendToUsers.calledOnce).to.be.true;
      expect(pushService.sendToUsers.firstCall.args[0]).to.deep.equal([
        offlineUserId,
      ]);
      expect(pushService.sendToUsers.firstCall.args[1].title).to.equal("John");
      expect(pushService.sendToUsers.firstCall.args[1].body).to.equal(
        "Hello world",
      );
    });

    it("should skip muted users", async () => {
      const message = {
        id: "msg-1",
        senderId,
        content: "Hello",
        sender: { profile: { firstName: "John" } },
      } as any;
      const memberUserIds = [senderId, mutedUserId];

      clientRegistry.isOnline.returns(false);
      clientRegistry.isOnline.withArgs(senderId).returns(true);

      // mutedUserId is muted until far future
      const future = new Date(Date.now() + 100000000);

      memberRepo.findMembershipsByChat.resolves([
        { userId: mutedUserId, mutedUntil: future },
      ]);

      const event = new MessageCreatedEvent(message, chatId, memberUserIds);

      await eventHandlers["MessageCreatedEvent"](event);

      expect(pushService.sendToUsers.called).to.be.false;
    });

    it("should send mention push to muted users when mentioned", async () => {
      const message = {
        id: "msg-1",
        senderId,
        content: "Hey @someone",
        sender: { profile: { firstName: "John" } },
      } as any;
      const memberUserIds = [senderId, offlineUserId, mutedUserId];

      clientRegistry.isOnline.returns(false);
      clientRegistry.isOnline.withArgs(senderId).returns(true);

      const future = new Date(Date.now() + 100000000);

      // offlineUserId not muted, mutedUserId is muted — batch response
      memberRepo.findMembershipsByChat.resolves([
        { userId: offlineUserId, mutedUntil: null },
        { userId: mutedUserId, mutedUntil: future },
      ]);

      const event = new MessageCreatedEvent(
        message,
        chatId,
        memberUserIds,
        [mutedUserId], // mentionedUserIds
        false,
      );

      await eventHandlers["MessageCreatedEvent"](event);

      // First call: normal push to offlineUserId
      expect(pushService.sendToUsers.callCount).to.equal(2);
      expect(pushService.sendToUsers.firstCall.args[0]).to.deep.equal([
        offlineUserId,
      ]);

      // Second call: mention push to mutedUserId
      expect(pushService.sendToUsers.secondCall.args[0]).to.deep.equal([
        mutedUserId,
      ]);
      expect(pushService.sendToUsers.secondCall.args[1].data.type).to.equal(
        "mention",
      );
    });

  });

  describe("ContactRequestEvent", () => {
    it("should send push to offline target user", async () => {
      const targetUserId = offlineUserId;
      const contact = { id: "contact-1" } as any;

      clientRegistry.isOnline.withArgs(targetUserId).returns(false);

      const event = new ContactRequestEvent(contact, targetUserId);

      await eventHandlers["ContactRequestEvent"](event);

      expect(pushService.sendToUser.calledOnce).to.be.true;
      expect(pushService.sendToUser.firstCall.args[0]).to.equal(targetUserId);
      expect(pushService.sendToUser.firstCall.args[1].data.type).to.equal(
        "contact_request",
      );
    });

    it("should not send push if target is online", async () => {
      const targetUserId = offlineUserId;
      const contact = { id: "contact-1" } as any;

      clientRegistry.isOnline.withArgs(targetUserId).returns(true);

      const event = new ContactRequestEvent(contact, targetUserId);

      await eventHandlers["ContactRequestEvent"](event);

      expect(pushService.sendToUser.called).to.be.false;
    });
  });
});
