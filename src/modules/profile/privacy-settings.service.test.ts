import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { EContactStatus } from "../contact/contact.types";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { PrivacySettingsService } from "./privacy-settings.service";

describe("PrivacySettingsService", () => {
  let service: PrivacySettingsService;
  let mockRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let mockContactRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const fakeSettings = {
    id: uuid2(),
    userId: uuid(),
    showLastOnline: EPrivacyLevel.EVERYONE,
    showPhone: EPrivacyLevel.CONTACTS,
    showAvatar: EPrivacyLevel.EVERYONE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    mockRepo = {
      ...createMockRepository(),
      findByUserId: sandbox.stub(),
    } as any;

    mockContactRepo = {
      ...createMockRepository(),
      findByUserPair: sandbox.stub(),
    } as any;

    service = new PrivacySettingsService(
      mockRepo as any,
      mockContactRepo as any,
      createMockEventBus() as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("getSettings", () => {
    it("should return existing settings", async () => {
      mockRepo.findByUserId.resolves(fakeSettings);

      const result = await service.getSettings(uuid());

      expect(result).to.deep.equal(fakeSettings);
      expect(mockRepo.findByUserId.calledWith(uuid())).to.be.true;
      expect(mockRepo.createAndSave.called).to.be.false;
    });

    it("should auto-create settings if not exists", async () => {
      mockRepo.findByUserId.resolves(null);
      mockRepo.createAndSave.resolves(fakeSettings);

      const result = await service.getSettings(uuid());

      expect(result).to.deep.equal(fakeSettings);
      expect(mockRepo.createAndSave.calledOnce).to.be.true;
      expect(mockRepo.createAndSave.firstCall.args[0]).to.have.property(
        "userId",
        uuid(),
      );
    });
  });

  describe("updateSettings", () => {
    it("should update existing settings fields", async () => {
      const existingSettings = { ...fakeSettings };

      mockRepo.findByUserId.resolves(existingSettings);
      mockRepo.save.resolves({
        ...existingSettings,
        showPhone: EPrivacyLevel.NOBODY,
      });

      const result = await service.updateSettings(uuid(), {
        showPhone: EPrivacyLevel.NOBODY,
      });

      expect(mockRepo.save.calledOnce).to.be.true;
      expect(existingSettings.showPhone).to.equal(EPrivacyLevel.NOBODY);
    });

    it("should create settings with data if not exists", async () => {
      mockRepo.findByUserId.resolves(null);
      mockRepo.createAndSave.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.NOBODY,
      });

      const result = await service.updateSettings(uuid(), {
        showPhone: EPrivacyLevel.NOBODY,
      });

      expect(result.showPhone).to.equal(EPrivacyLevel.NOBODY);
      expect(mockRepo.createAndSave.calledOnce).to.be.true;
    });

    it("should update multiple fields at once", async () => {
      const existingSettings = { ...fakeSettings };

      mockRepo.findByUserId.resolves(existingSettings);
      mockRepo.save.resolves(existingSettings);

      await service.updateSettings(uuid(), {
        showLastOnline: EPrivacyLevel.NOBODY,
        showPhone: EPrivacyLevel.EVERYONE,
        showAvatar: EPrivacyLevel.CONTACTS,
      });

      expect(existingSettings.showLastOnline).to.equal(EPrivacyLevel.NOBODY);
      expect(existingSettings.showPhone).to.equal(EPrivacyLevel.EVERYONE);
      expect(existingSettings.showAvatar).to.equal(EPrivacyLevel.CONTACTS);
    });

    it("should not modify fields that are not provided", async () => {
      const existingSettings = { ...fakeSettings };

      mockRepo.findByUserId.resolves(existingSettings);
      mockRepo.save.resolves(existingSettings);

      await service.updateSettings(uuid(), {
        showPhone: EPrivacyLevel.NOBODY,
      });

      expect(existingSettings.showLastOnline).to.equal(EPrivacyLevel.EVERYONE);
      expect(existingSettings.showAvatar).to.equal(EPrivacyLevel.EVERYONE);
      expect(existingSettings.showPhone).to.equal(EPrivacyLevel.NOBODY);
    });
  });

  describe("canSeeField", () => {
    it("should return true when viewer is the same user", async () => {
      const result = await service.canSeeField(
        uuid(),
        uuid(),
        "showLastOnline",
      );

      expect(result).to.be.true;
      // Should not even fetch settings
      expect(mockRepo.findByUserId.called).to.be.false;
    });

    it("should return true when privacy level is EVERYONE", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.EVERYONE,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.true;
    });

    it("should return false when privacy level is NOBODY", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showLastOnline: EPrivacyLevel.NOBODY,
      });

      const result = await service.canSeeField(
        uuid2(),
        uuid(),
        "showLastOnline",
      );

      expect(result).to.be.false;
    });

    it("should return true for CONTACTS level when users are accepted contacts", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });
      mockContactRepo.findByUserPair.resolves({
        status: EContactStatus.ACCEPTED,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.true;
      expect(mockContactRepo.findByUserPair.calledWith(uuid(), uuid2())).to.be
        .true;
    });

    it("should return false for CONTACTS level when users are not contacts", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });
      mockContactRepo.findByUserPair.resolves(null);

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.false;
    });

    it("should return false for CONTACTS level when contact status is PENDING", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });
      mockContactRepo.findByUserPair.resolves({
        status: EContactStatus.PENDING,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.false;
    });

    it("should return false for CONTACTS level when contact status is BLOCKED", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });
      mockContactRepo.findByUserPair.resolves({
        status: EContactStatus.BLOCKED,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.false;
    });

    it("should auto-create settings if target user has none", async () => {
      mockRepo.findByUserId.resolves(null);
      mockRepo.createAndSave.resolves({
        ...fakeSettings,
        showAvatar: EPrivacyLevel.EVERYONE,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showAvatar");

      expect(result).to.be.true;
      expect(mockRepo.createAndSave.calledOnce).to.be.true;
    });

    it("should check showAvatar field correctly", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showAvatar: EPrivacyLevel.NOBODY,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showAvatar");

      expect(result).to.be.false;
    });
  });
});
