import "reflect-metadata";

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
import { ChatMemberBannedEvent, ChatMemberLeftEvent } from "./events";

describe("ChatModerationService", () => {
  let service: ChatModerationService;
  let chatRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let banRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let txRepo: ReturnType<typeof createMockRepository>;
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
    banRepo = createMockRepository() as any;
    txRepo = createMockRepository();

    (memberRepo as any).findMembership = sinon.stub().resolves(null);
    (memberRepo as any).getMemberUserIds = sinon
      .stub()
      .resolves([userId, targetUserId]);
    banRepo.upsertBan = sinon.stub().resolves();
    banRepo.removeBan = sinon.stub().resolves(true);
    banRepo.findActiveBans = sinon.stub().resolves([]);

    const manager = { getRepository: sinon.stub().returns(txRepo) };

    service = new ChatModerationService(
      chatRepo as any,
      memberRepo as any,
      banRepo as any,
      eventBus as any,
      { transaction: sinon.stub().callsFake((cb: any) => cb(manager)) } as any,
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
        expect(err).to.have.property("status", 403);
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
        expect(err).to.have.property("status", 403);
      }
    });
  });

  describe("banMember", () => {
    it("admin bans regular member — пишет бан, удаляет членство, события", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "member-id", role: "member", userId: targetUserId });

      const before = Date.now();

      await service.banMember(chatId, userId, targetUserId, 60, "spam");

      const ban = banRepo.upsertBan.firstCall.args[0];

      expect(ban).to.include({
        chatId,
        userId: targetUserId,
        bannedById: userId,
        reason: "spam",
      });
      expect(ban.until.getTime()).to.be.at.least(before + 60_000);
      expect(txRepo.delete.calledWith({ id: "member-id" })).to.be.true;

      const events = eventBus.emit.getCalls().map(c => c.args[0]);

      expect(events.some(e => e instanceof ChatMemberBannedEvent)).to.be.true;
      expect(events.some(e => e instanceof ChatMemberLeftEvent)).to.be.true;
    });

    it("бан без duration — бессрочный (until = null)", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "owner", userId });
      (memberRepo as any).findMembership
        .withArgs(chatId, targetUserId)
        .resolves({ id: "member-id", role: "member", userId: targetUserId });

      await service.banMember(chatId, userId, targetUserId);

      expect(banRepo.upsertBan.firstCall.args[0].until).to.be.null;
    });

    it("self-ban throws ForbiddenException", async () => {
      (memberRepo as any).findMembership
        .withArgs(chatId, userId)
        .resolves({ role: "admin", userId });

      try {
        await service.banMember(chatId, userId, userId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
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
        expect(err).to.have.property("status", 403);
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
        expect(err).to.have.property("status", 403);
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

      expect(txRepo.delete.calledOnce).to.be.true;
      expect(banRepo.upsertBan.calledOnce).to.be.true;
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
        expect(err).to.have.property("status", 404);
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
        expect(err).to.have.property("status", 403);
      }
    });
  });

  describe("unbanMember", () => {
    it("admin unbans — удаляет запись бана, не возвращает в чат", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });

      await service.unbanMember(chatId, userId, targetUserId);

      expect(banRepo.removeBan.calledWith(chatId, targetUserId)).to.be.true;
      expect(memberRepo.save.called).to.be.false;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("бана нет — NotFoundException", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });
      banRepo.removeBan.resolves(false);

      try {
        await service.unbanMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
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
        expect(err).to.have.property("status", 403);
      }
    });

    it("non-member throws ForbiddenException", async () => {
      (memberRepo as any).findMembership.resolves(null);

      try {
        await service.unbanMember(chatId, userId, targetUserId);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
      }
    });
  });

  describe("getBannedMembers", () => {
    it("admin gets banned members list", async () => {
      (memberRepo as any).findMembership.resolves({
        role: "admin",
        userId,
      });

      const bannedAt = new Date("2025-01-01");
      const until = new Date("2030-01-01");

      banRepo.findActiveBans.resolves([
        [
          {
            chatId,
            userId: targetUserId,
            bannedById: userId,
            reason: "spam",
            until,
            createdAt: bannedAt,
          },
        ],
        1,
      ]);

      const result = await service.getBannedMembers(chatId, userId);

      expect(banRepo.findActiveBans.calledOnceWith(chatId, 0, 20)).to.be.true;
      expect(result.total).to.equal(1);
      expect(result.items).to.deep.equal([
        {
          chatId,
          userId: targetUserId,
          bannedBy: userId,
          reason: "spam",
          bannedAt,
          expiresAt: until,
        },
      ]);
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
        expect(err).to.have.property("status", 403);
      }
    });
  });
});
