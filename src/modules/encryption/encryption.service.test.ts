import "reflect-metadata";

import { NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { EncryptionService } from "./encryption.service";

describe("EncryptionService", () => {
  let service: EncryptionService;
  let keyRepo: ReturnType<typeof createMockRepository>;
  let preKeyRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const deviceId = "device-1";

  const makeUserKey = (overrides: Record<string, unknown> = {}) => ({
    id: uuid2(),
    userId,
    deviceId,
    identityKey: "identity-key-base64",
    signedPreKeyId: 1,
    signedPreKeyPublic: "signed-prekey-public",
    signedPreKeySignature: "signed-prekey-signature",
    isActive: true,
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    keyRepo = createMockRepository();
    preKeyRepo = createMockRepository();

    (keyRepo as any).findByDevice = sinon.stub().resolves(null);
    (keyRepo as any).findActiveKeys = sinon.stub().resolves([]);
    (preKeyRepo as any).getNextAvailable = sinon.stub().resolves(null);
    (preKeyRepo as any).countAvailable = sinon.stub().resolves(0);

    service = new EncryptionService(keyRepo as any, preKeyRepo as any, createMockEventBus() as any);
  });

  afterEach(() => sandbox.restore());

  describe("uploadKeys", () => {
    const uploadData = {
      deviceId,
      identityKey: "new-identity-key",
      signedPreKey: { id: 2, publicKey: "new-signed-pub", signature: "new-sig" },
      oneTimePreKeys: [
        { id: 100, publicKey: "otpk-100" },
        { id: 101, publicKey: "otpk-101" },
      ],
    };

    it("should create new user key when none exists", async () => {
      const created = makeUserKey();

      (keyRepo as any).findByDevice.resolves(null);
      keyRepo.createAndSave.resolves(created);
      preKeyRepo.findOne.resolves(null);
      preKeyRepo.createAndSave.resolves({});

      const result = await service.uploadKeys(userId, uploadData);

      expect(keyRepo.createAndSave.calledOnce).to.be.true;
      expect(preKeyRepo.createAndSave.callCount).to.equal(2);
      expect(result).to.exist;
    });

    it("should update existing user key", async () => {
      const existing = makeUserKey();

      (keyRepo as any).findByDevice.resolves(existing);
      keyRepo.save.resolves(existing);
      preKeyRepo.findOne.resolves(null);
      preKeyRepo.createAndSave.resolves({});

      await service.uploadKeys(userId, uploadData);

      expect(existing.identityKey).to.equal("new-identity-key");
      expect(existing.signedPreKeyId).to.equal(2);
      expect(existing.signedPreKeyPublic).to.equal("new-signed-pub");
      expect(existing.signedPreKeySignature).to.equal("new-sig");
      expect(keyRepo.save.calledOnce).to.be.true;
    });

    it("should skip existing one-time prekeys", async () => {
      (keyRepo as any).findByDevice.resolves(null);
      keyRepo.createAndSave.resolves(makeUserKey());
      // First prekey exists, second does not
      preKeyRepo.findOne
        .onFirstCall().resolves({ id: "existing-pk" })
        .onSecondCall().resolves(null);
      preKeyRepo.createAndSave.resolves({});

      await service.uploadKeys(userId, uploadData);

      expect(preKeyRepo.createAndSave.callCount).to.equal(1);
    });
  });

  describe("getKeyBundle", () => {
    it("should return key bundle with one-time prekey", async () => {
      const userKey = makeUserKey();

      (keyRepo as any).findActiveKeys.resolves([userKey]);
      (preKeyRepo as any).getNextAvailable.resolves({ keyId: 100, publicKey: "otpk-100" });

      const result = await service.getKeyBundle(userId);

      expect(result.userId).to.equal(userId);
      expect(result.deviceId).to.equal(deviceId);
      expect(result.identityKey).to.equal("identity-key-base64");
      expect(result.signedPreKey).to.deep.equal({
        id: 1,
        publicKey: "signed-prekey-public",
        signature: "signed-prekey-signature",
      });
      expect(result.oneTimePreKey).to.deep.equal({ id: 100, publicKey: "otpk-100" });
    });

    it("should return key bundle with null one-time prekey when none available", async () => {
      const userKey = makeUserKey();

      (keyRepo as any).findActiveKeys.resolves([userKey]);
      (preKeyRepo as any).getNextAvailable.resolves(null);

      const result = await service.getKeyBundle(userId);

      expect(result.oneTimePreKey).to.be.null;
    });

    it("should throw NotFoundException when no keys registered", async () => {
      (keyRepo as any).findActiveKeys.resolves([]);

      try {
        await service.getKeyBundle(userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("uploadPreKeys", () => {
    it("should add new prekeys and return count", async () => {
      preKeyRepo.findOne.resolves(null);
      preKeyRepo.createAndSave.resolves({});
      (preKeyRepo as any).countAvailable.resolves(5);

      const result = await service.uploadPreKeys(userId, [
        { id: 200, publicKey: "pk-200" },
        { id: 201, publicKey: "pk-201" },
      ]);

      expect(preKeyRepo.createAndSave.callCount).to.equal(2);
      expect(result).to.equal(5);
    });

    it("should skip already existing prekeys", async () => {
      preKeyRepo.findOne.resolves({ id: "existing" });
      (preKeyRepo as any).countAvailable.resolves(10);

      const result = await service.uploadPreKeys(userId, [
        { id: 200, publicKey: "pk-200" },
      ]);

      expect(preKeyRepo.createAndSave.called).to.be.false;
      expect(result).to.equal(10);
    });
  });

  describe("revokeDevice", () => {
    it("should deactivate the user key", async () => {
      const key = makeUserKey({ isActive: true });

      (keyRepo as any).findByDevice.resolves(key);
      keyRepo.save.resolves(key);

      await service.revokeDevice(userId, deviceId);

      expect(key.isActive).to.be.false;
      expect(keyRepo.save.calledOnce).to.be.true;
    });

    it("should do nothing when key not found", async () => {
      (keyRepo as any).findByDevice.resolves(null);

      await service.revokeDevice(userId, deviceId);

      expect(keyRepo.save.called).to.be.false;
    });
  });
});
