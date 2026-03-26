import "reflect-metadata";

import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { ChatModerationService } from "./chat-moderation.service";

describe("ChatModerationService", () => {
  let service: ChatModerationService;
  let chatRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const targetUserId = uuid2();
  const chatId = uuid3();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    chatRepo = createMockRepository();
    memberRepo = createMockRepository();
    eventBus = createMockEventBus();

    (memberRepo as any).findMembership = sinon.stub().resolves(null);

    service = new ChatModerationService(
      chatRepo as any,
      memberRepo as any,
      eventBus as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("setSlowMode", () => {
    it("admin sets slow mode, updates and emits event", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });

      const result = await service.setSlowMode(chatId, userId, 30);

      expect(result).to.deep.equal({ chatId, slowModeSeconds: 30 });
      expect(chatRepo.update.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("owner sets slow mode, updates and emits event", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "owner",
        userId,
      });

      const result = await service.setSlowMode(chatId, userId, 10);

      expect(result).to.deep.equal({ chatId, slowModeSeconds: 10 });
      expect(chatRepo.update.calledOnce).to.be.true;
    });

    it("non-member throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.setSlowMode(chatId, userId, 30);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("regular member throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "member",
        userId,
      });

      try {
        await service.setSlowMode(chatId, userId, 30);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("banMember", () => {
    it("admin bans regular member - deletes and emits event", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "member-id", role: "member", userId: targetUserId });

      await service.banMember(chatId, userId, targetUserId);

      expect(memberRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("self-ban throws ForbiddenException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });

      try {
        await service.banMember(chatId, userId, userId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("ban owner throws ForbiddenException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "m-id", role: "owner", userId: targetUserId });

      try {
        await service.banMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("admin bans another admin (only owner can) throws ForbiddenException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "m-id", role: "admin", userId: targetUserId });

      try {
        await service.banMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("owner can ban admin", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "owner", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "m-id", role: "admin", userId: targetUserId });

      await service.banMember(chatId, userId, targetUserId);

      expect(memberRepo.delete.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("target not found throws NotFoundException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves(null);

      try {
        await service.banMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("non-admin throws ForbiddenException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "member", userId });

      try {
        await service.banMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("unbanMember", () => {
    it("admin unbans member, emits event", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });

      await service.unbanMember(chatId, userId, targetUserId);

      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("non-admin throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "member",
        userId,
      });

      try {
        await service.unbanMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("non-member throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.unbanMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("getBannedMembers", () => {
    it("admin gets banned members list", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });

      const result = await service.getBannedMembers(chatId, userId);

      expect(result).to.deep.equal([]);
    });

    it("non-admin throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "member",
        userId,
      });

      try {
        await service.getBannedMembers(chatId, userId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });
});
