import "reflect-metadata";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { BiometricService } from "./biometric.service";

describe("BiometricService", () => {
  let service: BiometricService;
  let biometricRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let userService: Record<string, sinon.SinonStub>;
  let tokenService: Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const deviceId = "device-001";

  const makeBiometric = (overrides: Record<string, unknown> = {}) => ({
    id: "bio-1",
    userId,
    deviceId,
    deviceName: "iPhone",
    publicKey: "dGVzdC1rZXk=",
    challenge: null as string | null,
    challengeExpiresAt: null as Date | null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    biometricRepo = createMockRepository() as any;
    userService = {
      getUser: sinon.stub(),
    };
    tokenService = {
      issue: sinon.stub().resolves({ accessToken: "at", refreshToken: "rt" }),
    };

    // Custom repo methods
    biometricRepo.findByUserIdAndDeviceId = sinon.stub().resolves(null);
    biometricRepo.countByUserId = sinon.stub().resolves(0);
    biometricRepo.findByUserId = sinon.stub().resolves([]);
    biometricRepo.deleteByUserIdAndDeviceId = sinon.stub().resolves({ affected: 1 });

    service = new BiometricService(
      userService as any,
      tokenService as any,
      biometricRepo as any,
      { create: sinon.stub().resolves({ id: "session-1" }) } as any,
    );
  });

  afterEach(() => sandbox.restore());

  // ───── registerBiometric ─────

  describe("registerBiometric", () => {
    it("should update existing device", async () => {
      const existing = makeBiometric();

      biometricRepo.findByUserIdAndDeviceId.resolves(existing);

      await service.registerBiometric(userId, deviceId, "New Name", "bmV3LWtleQ==");

      expect(biometricRepo.save.calledOnce).to.be.true;
      expect(existing.publicKey).to.equal("bmV3LWtleQ==");
      expect(existing.deviceName).to.equal("New Name");
    });

    it("should create new device when none exists", async () => {
      biometricRepo.findByUserIdAndDeviceId.resolves(null);
      biometricRepo.countByUserId.resolves(2);

      await service.registerBiometric(userId, deviceId, "iPhone", "dGVzdC1rZXk=");

      expect(biometricRepo.createAndSave.calledOnce).to.be.true;
      const args = biometricRepo.createAndSave.firstCall.args[0];

      expect(args.userId).to.equal(userId);
      expect(args.deviceId).to.equal(deviceId);
    });

    it("should throw ConflictException when max devices exceeded", async () => {
      biometricRepo.findByUserIdAndDeviceId.resolves(null);
      biometricRepo.countByUserId.resolves(5);

      try {
        await service.registerBiometric(userId, deviceId, "iPhone", "key");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ConflictException);
      }
    });
  });

  // ───── generateNonce ─────

  describe("generateNonce", () => {
    it("should return nonce on success", async () => {
      const bio = makeBiometric();

      biometricRepo.findByUserIdAndDeviceId.resolves(bio);

      const result = await service.generateNonce(userId, deviceId);

      expect(result).to.have.property("nonce").that.is.a("string");
      expect(biometricRepo.save.calledOnce).to.be.true;
      expect(bio.challenge).to.be.a("string");
      expect(bio.challengeExpiresAt).to.be.instanceOf(Date);
    });

    it("should throw NotFoundException when device not found", async () => {
      biometricRepo.findByUserIdAndDeviceId.resolves(null);

      try {
        await service.generateNonce(userId, deviceId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── verifyBiometricSignature ─────

  describe("verifyBiometricSignature", () => {
    it("should throw NotFoundException when device not found", async () => {
      biometricRepo.findByUserIdAndDeviceId.resolves(null);

      try {
        await service.verifyBiometricSignature(userId, deviceId, "sig");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw BadRequestException when no challenge", async () => {
      biometricRepo.findByUserIdAndDeviceId.resolves(
        makeBiometric({ challenge: null }),
      );

      try {
        await service.verifyBiometricSignature(userId, deviceId, "sig");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect((err as any).message).to.include("Challenge не найден");
      }
    });

    it("should clear challenge and throw when expired", async () => {
      const bio = makeBiometric({
        challenge: "old-nonce",
        challengeExpiresAt: new Date(Date.now() - 10000),
      });

      biometricRepo.findByUserIdAndDeviceId.resolves(bio);

      try {
        await service.verifyBiometricSignature(userId, deviceId, "sig");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect((err as any).message).to.include("Challenge истёк");
        expect(biometricRepo.save.calledOnce).to.be.true;
        expect(bio.challenge).to.be.null;
        expect(bio.challengeExpiresAt).to.be.null;
      }
    });

    it("should throw UnauthorizedException when signature is invalid", async () => {
      // Provide a valid-looking biometric with active challenge but bad key/signature
      // so crypto.createVerify will catch and return false
      const bio = makeBiometric({
        challenge: "valid-nonce",
        challengeExpiresAt: new Date(Date.now() + 300000),
        publicKey: "not-a-real-key",
      });

      biometricRepo.findByUserIdAndDeviceId.resolves(bio);

      try {
        await service.verifyBiometricSignature(userId, deviceId, "bad-sig");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect((err as any).message).to.include("Неверная биометрическая подпись");
      }
    });
  });

  // ───── getDevices ─────

  describe("getDevices", () => {
    it("should return list of devices", async () => {
      const devices = [makeBiometric(), makeBiometric({ deviceId: "device-002" })];

      biometricRepo.findByUserId.resolves(devices);

      const result = await service.getDevices(userId);

      expect(result).to.have.length(2);
      expect(biometricRepo.findByUserId.calledOnceWith(userId)).to.be.true;
    });
  });

  // ───── deleteDevice ─────

  describe("deleteDevice", () => {
    it("should delete device successfully", async () => {
      biometricRepo.deleteByUserIdAndDeviceId.resolves({ affected: 1 });

      const result = await service.deleteDevice(userId, deviceId);

      expect(result).to.deep.equal({ deleted: true });
      expect(biometricRepo.deleteByUserIdAndDeviceId.calledOnceWith(userId, deviceId)).to.be.true;
    });

    it("should throw NotFoundException when device not found", async () => {
      biometricRepo.deleteByUserIdAndDeviceId.resolves({ affected: 0 });

      try {
        await service.deleteDevice(userId, deviceId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });
});
