import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { DeviceTokenService } from "./device-token.service";
import { PushError } from "./push.errors";
import { EDevicePlatform } from "./push.types";

describe("DeviceTokenService", () => {
  let service: DeviceTokenService;
  let tokenRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    tokenRepo = createMockRepository();

    (tokenRepo as any).findByToken = sinon.stub().resolves(null);
    (tokenRepo as any).findByUserId = sinon.stub().resolves([]);
    (tokenRepo as any).deleteByToken = sinon.stub().resolves();
    (tokenRepo as any).deleteBySessionId = sinon.stub().resolves();

    service = new DeviceTokenService(tokenRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("registerToken", () => {
    const sessionId = "session-1";

    it("should create a new device token bound to the session", async () => {
      tokenRepo.createAndSave.resolves({
        id: "dt-1",
        userId,
        sessionId,
        token: "fcm-token",
        platform: EDevicePlatform.ANDROID,
        deviceName: "Pixel 5",
        createdAt: new Date(),
      });

      const result = await service.registerToken(
        userId,
        sessionId,
        "fcm-token",
        EDevicePlatform.ANDROID,
        "Pixel 5",
      );

      expect(tokenRepo.createAndSave.firstCall.args[0]).to.deep.include({
        userId,
        sessionId,
        token: "fcm-token",
        platform: EDevicePlatform.ANDROID,
        deviceName: "Pixel 5",
      });
      expect(result).to.have.property("token", "fcm-token");
    });

    it("should refresh own token (session, platform, name) in place", async () => {
      const existing = {
        id: "dt-1",
        userId,
        sessionId: "old-session",
        token: "fcm-token",
        platform: EDevicePlatform.IOS,
        deviceName: "iPhone",
        createdAt: new Date(),
      };

      (tokenRepo as any).findByToken.resolves(existing);

      await service.registerToken(
        userId,
        sessionId,
        "fcm-token",
        EDevicePlatform.ANDROID,
      );

      expect(tokenRepo.save.calledOnce).to.be.true;
      expect(existing.sessionId).to.equal(sessionId);
      expect(existing.platform).to.equal(EDevicePlatform.ANDROID);
      expect(existing.deviceName).to.equal("iPhone");
      expect(tokenRepo.createAndSave.called).to.be.false;
    });

    it("should drop another user's binding before rebinding the token", async () => {
      const existing = {
        id: "dt-1",
        userId: "other-user",
        sessionId: "other-session",
        token: "fcm-token",
        platform: EDevicePlatform.IOS,
        deviceName: "iPhone",
        createdAt: new Date(),
      };

      (tokenRepo as any).findByToken.resolves(existing);
      tokenRepo.createAndSave.resolves({ ...existing, userId, sessionId });

      await service.registerToken(
        userId,
        sessionId,
        "fcm-token",
        EDevicePlatform.IOS,
      );

      expect(tokenRepo.delete.calledOnceWith({ id: "dt-1" })).to.be.true;
      expect(tokenRepo.save.called).to.be.false;
      expect(tokenRepo.createAndSave.firstCall.args[0]).to.deep.include({
        userId,
        sessionId,
        deviceName: null,
      });
      expect(tokenRepo.delete.calledBefore(tokenRepo.createAndSave)).to.be.true;
    });
  });

  describe("unregisterToken", () => {
    it("should delete own token", async () => {
      (tokenRepo as any).findByToken.resolves({ id: "dt-1", userId });

      await service.unregisterToken(userId, "fcm-token");

      expect((tokenRepo as any).deleteByToken.calledOnceWith("fcm-token")).to.be
        .true;
    });

    it("should 404 for a missing token", async () => {
      try {
        await service.unregisterToken(userId, "missing");
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as any).code).to.equal(PushError.codes.DEVICE_NOT_FOUND);
      }
    });

    it("should 404 and keep someone else's token", async () => {
      (tokenRepo as any).findByToken.resolves({
        id: "dt-1",
        userId: "other-user",
      });

      try {
        await service.unregisterToken(userId, "fcm-token");
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as any).code).to.equal(PushError.codes.DEVICE_NOT_FOUND);
      }

      expect((tokenRepo as any).deleteByToken.called).to.be.false;
    });
  });

  describe("removeBySession", () => {
    it("should delete tokens of the session", async () => {
      await service.removeBySession("session-1");

      expect((tokenRepo as any).deleteBySessionId.calledOnceWith("session-1"))
        .to.be.true;
    });
  });

  describe("getTokensForUser", () => {
    it("should return DTOs of user tokens", async () => {
      const tokens = [
        {
          id: "dt-1",
          userId,
          token: "token-1",
          platform: EDevicePlatform.ANDROID,
          deviceName: "Pixel",
          createdAt: new Date(),
        },
        {
          id: "dt-2",
          userId,
          token: "token-2",
          platform: EDevicePlatform.IOS,
          deviceName: "iPhone",
          createdAt: new Date(),
        },
      ];

      (tokenRepo as any).findByUserId.resolves(tokens);

      const result = await service.getTokensForUser(userId);

      expect((tokenRepo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.property("token", "token-1");
      expect(result[1]).to.have.property("token", "token-2");
    });
  });
});
