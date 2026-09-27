import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { PrivacySettingsService } from "./privacy-settings.service";

describe("PrivacySettingsService", () => {
  let service: PrivacySettingsService;
  let mockRepo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let contactsOf: sinon.SinonStub;
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
      findByUserIds: sandbox.stub().resolves([]),
      findOrCreate: sandbox.stub(),
    } as any;

    contactsOf = sandbox.stub().resolves([]);

    service = new PrivacySettingsService(
      mockRepo as any,
      createMockEventBus() as any,
      [{ contactsOf }],
    );
  });

  afterEach(() => sandbox.restore());

  describe("getSettings", () => {
    it("should return settings via race-free findOrCreate", async () => {
      mockRepo.findOrCreate.resolves(fakeSettings);

      const result = await service.getSettings(uuid());

      expect(result).to.deep.equal(fakeSettings);
      expect(mockRepo.findOrCreate.calledWith(uuid())).to.be.true;
      expect(mockRepo.createAndSave.called).to.be.false;
    });
  });

  describe("updateSettings", () => {
    it("should update only provided fields", async () => {
      const existingSettings = { ...fakeSettings };

      mockRepo.findOrCreate.resolves(existingSettings);
      mockRepo.save.callsFake(async (e: any) => e);

      await service.updateSettings(uuid(), {
        showPhone: EPrivacyLevel.NOBODY,
      });

      expect(mockRepo.save.calledOnce).to.be.true;
      expect(mockRepo.createAndSave.called).to.be.false;
      expect(existingSettings.showPhone).to.equal(EPrivacyLevel.NOBODY);
      expect(existingSettings.showLastOnline).to.equal(EPrivacyLevel.EVERYONE);
      expect(existingSettings.showAvatar).to.equal(EPrivacyLevel.EVERYONE);
    });

    it("should update multiple fields at once", async () => {
      const existingSettings = { ...fakeSettings };

      mockRepo.findOrCreate.resolves(existingSettings);
      mockRepo.save.callsFake(async (e: any) => e);

      await service.updateSettings(uuid(), {
        showLastOnline: EPrivacyLevel.NOBODY,
        showPhone: EPrivacyLevel.EVERYONE,
        showAvatar: EPrivacyLevel.CONTACTS,
      });

      expect(existingSettings.showLastOnline).to.equal(EPrivacyLevel.NOBODY);
      expect(existingSettings.showPhone).to.equal(EPrivacyLevel.EVERYONE);
      expect(existingSettings.showAvatar).to.equal(EPrivacyLevel.CONTACTS);
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

    it("CONTACTS: видно, если модуль связей считает зрителя контактом", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });
      contactsOf.resolves([uuid()]);

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.true;
      expect(contactsOf.calledWith(uuid2(), [uuid()])).to.be.true;
    });

    it("CONTACTS: не видно, если зритель не контакт", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });

      const result = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(result).to.be.false;
    });

    it("CONTACTS без модулей связей — видно только самому пользователю", async () => {
      mockRepo.findByUserId.resolves({
        ...fakeSettings,
        showPhone: EPrivacyLevel.CONTACTS,
      });

      const bare = new PrivacySettingsService(
        mockRepo as any,
        createMockEventBus() as any,
      );

      expect(await bare.canSeeField(uuid2(), uuid(), "showPhone")).to.be.false;
      expect(await bare.canSeeField(uuid(), uuid(), "showPhone")).to.be.true;
    });

    it("should use defaults without writing when target has no settings", async () => {
      mockRepo.findByUserId.resolves(null);

      const avatar = await service.canSeeField(uuid2(), uuid(), "showAvatar");
      const phone = await service.canSeeField(uuid2(), uuid(), "showPhone");

      expect(avatar).to.be.true;
      // showPhone по умолчанию CONTACTS, контакта нет
      expect(phone).to.be.false;
      expect(mockRepo.createAndSave.called).to.be.false;
      expect(mockRepo.findOrCreate.called).to.be.false;
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

  describe("getVisibleUserIds", () => {
    it("should resolve visibility in batch (self, everyone, contacts, nobody, defaults)", async () => {
      const viewer = "viewer";

      mockRepo.findByUserIds.resolves([
        { userId: "open", showPhone: EPrivacyLevel.EVERYONE },
        { userId: "closed", showPhone: EPrivacyLevel.NOBODY },
        { userId: "friend", showPhone: EPrivacyLevel.CONTACTS },
      ]);
      contactsOf.resolves(["friend"]);

      const visible = await service.getVisibleUserIds(
        viewer,
        [viewer, "open", "closed", "friend", "no-settings"],
        "showPhone",
      );

      expect([...visible].sort()).to.deep.equal(
        ["friend", "open", viewer].sort(),
      );
      expect(contactsOf.calledOnceWith(viewer, ["friend", "no-settings"])).to.be
        .true;
      expect(mockRepo.createAndSave.called).to.be.false;
    });

    it("should skip queries for empty input", async () => {
      const visible = await service.getVisibleUserIds("v", [], "showPhone");

      expect(visible.size).to.equal(0);
      expect(mockRepo.findByUserIds.called).to.be.false;
    });
  });
});
