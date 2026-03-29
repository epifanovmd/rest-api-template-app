import "reflect-metadata";

import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  let service: SessionService;
  let sessionRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const sessionId = uuid2();

  const makeSession = (overrides: Record<string, unknown> = {}) => ({
    id: sessionId,
    userId,
    refreshToken: "refresh-token-123",
    deviceName: "iPhone",
    deviceType: "mobile",
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sessionRepo = createMockRepository();

    (sessionRepo as any).findByUserId = sinon.stub().resolves([]);
    (sessionRepo as any).findByRefreshToken = sinon.stub().resolves(null);

    const mockTokenService = {
      issue: sinon.stub().resolves({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    };

    service = new SessionService(
      sessionRepo as any,
      mockTokenService as any,
      createMockEventBus() as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("createSession", () => {
    it("should create a session record", async () => {
      const session = makeSession();

      sessionRepo.createAndSave.resolves(session);

      const result = await service.createSession({
        userId,
        refreshToken: "refresh-token-123",
        deviceName: "iPhone",
        deviceType: "mobile",
        ip: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      });

      expect(sessionRepo.createAndSave.calledOnce).to.be.true;
      expect(result).to.have.property("id", sessionId);
      expect(result).to.have.property("userId", userId);
    });

    it("should handle optional fields with defaults", async () => {
      const session = makeSession({ deviceName: null, deviceType: null, ip: null, userAgent: null });

      sessionRepo.createAndSave.resolves(session);

      await service.createSession({ userId, refreshToken: "token" });

      const savedData = sessionRepo.createAndSave.firstCall.args[0];

      expect(savedData.deviceName).to.be.null;
      expect(savedData.deviceType).to.be.null;
      expect(savedData.ip).to.be.null;
      expect(savedData.userAgent).to.be.null;
    });
  });

  describe("getSessions", () => {
    it("should return user's sessions", async () => {
      const sessions = [makeSession(), makeSession({ id: "session-2" })];

      (sessionRepo as any).findByUserId.resolves(sessions);

      const result = await service.getSessions(userId);

      expect((sessionRepo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(result).to.have.length(2);
    });
  });

  describe("terminateSession", () => {
    it("should delete the session", async () => {
      const session = makeSession();

      sessionRepo.findOne.resolves(session);

      await service.terminateSession(sessionId, userId);

      expect(sessionRepo.delete.calledOnceWith({ id: sessionId })).to.be.true;
    });

    it("should throw NotFoundException when session not found", async () => {
      sessionRepo.findOne.resolves(null);

      try {
        await service.terminateSession(sessionId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw ForbiddenException when wrong user", async () => {
      const session = makeSession({ userId: "other-user" });

      sessionRepo.findOne.resolves(session);

      try {
        await service.terminateSession(sessionId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("terminateAllOther", () => {
    it("should delete all sessions except the current one", async () => {
      const currentSessionId = "current-session";

      await service.terminateAllOther(userId, currentSessionId);

      expect(sessionRepo.delete.calledOnce).to.be.true;
      const deleteArg = sessionRepo.delete.firstCall.args[0];

      expect(deleteArg.userId).to.equal(userId);
      // The id should be wrapped in a Not() TypeORM operator
      expect(deleteArg.id).to.exist;
    });
  });

  describe("findByRefreshToken", () => {
    it("should return session by refresh token", async () => {
      const session = makeSession();

      (sessionRepo as any).findByRefreshToken.resolves(session);

      const result = await service.findByRefreshToken("refresh-token-123");

      expect((sessionRepo as any).findByRefreshToken.calledOnceWith("refresh-token-123")).to.be.true;
      expect(result).to.deep.equal(session);
    });
  });

  describe("updateLastActive", () => {
    it("should update lastActiveAt for the session", async () => {
      await service.updateLastActive(sessionId);

      expect(sessionRepo.update.calledOnce).to.be.true;
      const [id, data] = sessionRepo.update.firstCall.args;

      expect(id).to.equal(sessionId);
      expect(data.lastActiveAt).to.be.instanceOf(Date);
    });
  });
});
