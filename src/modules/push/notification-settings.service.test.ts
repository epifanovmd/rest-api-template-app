import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid } from "../../test/helpers";
import { NotificationSettingsService } from "./notification-settings.service";

describe("NotificationSettingsService", () => {
  let service: NotificationSettingsService;
  let settingsRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    settingsRepo = createMockRepository();

    (settingsRepo as any).findByUserId = sinon.stub().resolves(null);
    (settingsRepo as any).upsertSettings = sinon.stub().resolves(null);

    service = new NotificationSettingsService(settingsRepo as any, createMockEventBus() as any);
  });

  afterEach(() => sandbox.restore());

  describe("getSettings", () => {
    it("should return existing settings", async () => {
      const settings = {
        id: "ns-1",
        userId,
        muteAll: false,
        soundEnabled: true,
        showPreview: true,
      };

      (settingsRepo as any).findByUserId.resolves(settings);

      const result = await service.getSettings(userId);

      expect((settingsRepo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(result).to.have.property("muteAll", false);
      expect(result).to.have.property("soundEnabled", true);
      expect(result).to.have.property("showPreview", true);
    });

    it("should auto-create default settings when not found", async () => {
      (settingsRepo as any).findByUserId.resolves(null);
      settingsRepo.createAndSave.resolves({
        id: "ns-1",
        userId,
        muteAll: false,
        soundEnabled: true,
        showPreview: true,
      });

      const result = await service.getSettings(userId);

      expect(settingsRepo.createAndSave.calledOnce).to.be.true;
      expect(settingsRepo.createAndSave.firstCall.args[0]).to.deep.include({ userId });
      expect(result).to.have.property("muteAll", false);
    });
  });

  describe("updateSettings", () => {
    it("should update settings fields", async () => {
      const updatedSettings = {
        id: "ns-1",
        userId,
        muteAll: true,
        soundEnabled: false,
        showPreview: true,
      };

      (settingsRepo as any).upsertSettings.resolves(updatedSettings);

      const result = await service.updateSettings(userId, {
        muteAll: true,
        soundEnabled: false,
      });

      expect((settingsRepo as any).upsertSettings.calledOnce).to.be.true;
      expect((settingsRepo as any).upsertSettings.firstCall.args[0]).to.equal(userId);
      expect((settingsRepo as any).upsertSettings.firstCall.args[1]).to.deep.equal({
        muteAll: true,
        soundEnabled: false,
      });
      expect(result).to.have.property("muteAll", true);
      expect(result).to.have.property("soundEnabled", false);
    });
  });
});
