import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { DeviceTokenService } from "./device-token.service";
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

    service = new DeviceTokenService(tokenRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("registerToken", () => {
    it("should create a new device token when token does not exist", async () => {
      (tokenRepo as any).findByToken.resolves(null);
      tokenRepo.createAndSave.resolves({
        id: "dt-1",
        userId,
        token: "fcm-token",
        platform: EDevicePlatform.ANDROID,
        deviceName: "Pixel 5",
        createdAt: new Date(),
      });

      const result = await service.registerToken(userId, "fcm-token", EDevicePlatform.ANDROID, "Pixel 5");

      expect(tokenRepo.createAndSave.calledOnce).to.be.true;
      expect(tokenRepo.createAndSave.firstCall.args[0]).to.deep.include({
        userId,
        token: "fcm-token",
        platform: EDevicePlatform.ANDROID,
        deviceName: "Pixel 5",
      });
      expect(result).to.have.property("token", "fcm-token");
    });

    it("should update existing token when token already exists (upsert)", async () => {
      const existing = {
        id: "dt-1",
        userId: "old-user",
        token: "fcm-token",
        platform: EDevicePlatform.IOS,
        deviceName: "iPhone",
        createdAt: new Date(),
      };

      (tokenRepo as any).findByToken.resolves(existing);
      tokenRepo.save.resolves(existing);

      const result = await service.registerToken(userId, "fcm-token", EDevicePlatform.ANDROID, "Pixel 5");

      expect(tokenRepo.save.calledOnce).to.be.true;
      expect(existing.userId).to.equal(userId);
      expect(existing.platform).to.equal(EDevicePlatform.ANDROID);
      expect(existing.deviceName).to.equal("Pixel 5");
      expect(tokenRepo.createAndSave.called).to.be.false;
    });

    it("should keep existing deviceName when not provided during upsert", async () => {
      const existing = {
        id: "dt-1",
        userId: "old-user",
        token: "fcm-token",
        platform: EDevicePlatform.IOS,
        deviceName: "iPhone",
        createdAt: new Date(),
      };

      (tokenRepo as any).findByToken.resolves(existing);
      tokenRepo.save.resolves(existing);

      await service.registerToken(userId, "fcm-token", EDevicePlatform.WEB);

      expect(existing.deviceName).to.equal("iPhone");
    });
  });

  describe("unregisterToken", () => {
    it("should delete token by token string", async () => {
      await service.unregisterToken("fcm-token");

      expect((tokenRepo as any).deleteByToken.calledOnceWith("fcm-token")).to.be.true;
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
