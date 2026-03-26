import "reflect-metadata";

import { BadRequestException, ForbiddenException, NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { BotService } from "./bot.service";

describe("BotService", () => {
  let service: BotService;
  let botRepo: ReturnType<typeof createMockRepository>;
  let cmdRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const ownerId = uuid();
  const botId = uuid2();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    botRepo = createMockRepository();
    cmdRepo = createMockRepository();

    // Add custom repository methods as stubs
    (botRepo as any).findByUsername = sinon.stub().resolves(null);
    (botRepo as any).findByOwnerId = sinon.stub().resolves([]);
    (botRepo as any).findByIdWithDetails = sinon.stub().resolves(null);
    (botRepo as any).findByToken = sinon.stub().resolves(null);
    (cmdRepo as any).findByBotId = sinon.stub().resolves([]);

    service = new BotService(botRepo as any, cmdRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("createBot", () => {
    it("should generate a token and create a bot", async () => {
      const data = { username: "testbot", displayName: "Test Bot" };

      botRepo.createAndSave.resolves({ id: botId, ...data, ownerId, token: "generated-token" });

      const result = await service.createBot(ownerId, data);

      expect((botRepo as any).findByUsername.calledOnceWith("testbot")).to.be.true;
      expect(botRepo.createAndSave.calledOnce).to.be.true;

      const savedData = botRepo.createAndSave.firstCall.args[0];

      expect(savedData.ownerId).to.equal(ownerId);
      expect(savedData.username).to.equal("testbot");
      expect(savedData.displayName).to.equal("Test Bot");
      expect(savedData.token).to.be.a("string").and.have.length.greaterThan(0);
      expect(result).to.have.property("id");
    });

    it("should throw if username is already taken", async () => {
      (botRepo as any).findByUsername.resolves({ id: "existing-bot" });

      try {
        await service.createBot(ownerId, { username: "taken", displayName: "Bot" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("getMyBots", () => {
    it("should return owner's bots", async () => {
      const bots = [{ id: botId, ownerId }];

      (botRepo as any).findByOwnerId.resolves(bots);

      const result = await service.getMyBots(ownerId);

      expect((botRepo as any).findByOwnerId.calledOnceWith(ownerId)).to.be.true;
      expect(result).to.deep.equal(bots);
    });
  });

  describe("getBotById", () => {
    it("should return bot when owner matches", async () => {
      const bot = { id: botId, ownerId };

      (botRepo as any).findByIdWithDetails.resolves(bot);

      const result = await service.getBotById(botId, ownerId);

      expect(result).to.deep.equal(bot);
    });

    it("should throw ForbiddenException when not owner", async () => {
      (botRepo as any).findByIdWithDetails.resolves({ id: botId, ownerId: "other-user" });

      try {
        await service.getBotById(botId, ownerId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when bot not found", async () => {
      (botRepo as any).findByIdWithDetails.resolves(null);

      try {
        await service.getBotById(botId, ownerId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("updateBot", () => {
    it("should update fields on the bot", async () => {
      const bot = { id: botId, ownerId, displayName: "Old", description: "Old desc", avatarId: null };

      (botRepo as any).findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      await service.updateBot(botId, ownerId, { displayName: "New", description: "New desc" });

      expect(bot.displayName).to.equal("New");
      expect(bot.description).to.equal("New desc");
      expect(botRepo.save.calledOnce).to.be.true;
    });
  });

  describe("deleteBot", () => {
    it("should delete the bot", async () => {
      const bot = { id: botId, ownerId };

      (botRepo as any).findByIdWithDetails.resolves(bot);

      await service.deleteBot(botId, ownerId);

      expect(botRepo.delete.calledOnceWith({ id: botId })).to.be.true;
    });
  });

  describe("regenerateToken", () => {
    it("should generate a new token and save", async () => {
      const bot = { id: botId, ownerId, token: "old-token" };

      (botRepo as any).findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      const result = await service.regenerateToken(botId, ownerId);

      expect(result.token).to.not.equal("old-token");
      expect(result.token).to.be.a("string").and.have.length.greaterThan(0);
      expect(botRepo.save.calledOnce).to.be.true;
    });
  });

  describe("setWebhook", () => {
    it("should save webhook url and generate a secret", async () => {
      const bot = { id: botId, ownerId, webhookUrl: null, webhookSecret: null };

      (botRepo as any).findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      const result = await service.setWebhook(botId, ownerId, "https://example.com/hook");

      expect(result.webhookUrl).to.equal("https://example.com/hook");
      expect(result.webhookSecret).to.be.a("string").and.have.length.greaterThan(0);
      expect(botRepo.save.calledOnce).to.be.true;
    });
  });

  describe("deleteWebhook", () => {
    it("should clear webhook url and secret", async () => {
      const bot = { id: botId, ownerId, webhookUrl: "https://example.com", webhookSecret: "sec" };

      (botRepo as any).findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      await service.deleteWebhook(botId, ownerId);

      expect(bot.webhookUrl).to.be.null;
      expect(bot.webhookSecret).to.be.null;
      expect(botRepo.save.calledOnce).to.be.true;
    });
  });

  describe("setCommands", () => {
    it("should replace all commands for a bot", async () => {
      const bot = { id: botId, ownerId };
      const commands = [
        { command: "/start", description: "Start bot" },
        { command: "/help", description: "Get help" },
      ];

      (botRepo as any).findByIdWithDetails.resolves(bot);
      cmdRepo.delete.resolves({ affected: 1 });
      cmdRepo.createAndSave.resolves({});
      (cmdRepo as any).findByBotId.resolves(commands);

      const result = await service.setCommands(botId, ownerId, commands);

      expect(cmdRepo.delete.calledOnceWith({ botId })).to.be.true;
      expect(cmdRepo.createAndSave.callCount).to.equal(2);
      expect(result).to.deep.equal(commands);
    });
  });

  describe("getCommands", () => {
    it("should return commands for a bot", async () => {
      const commands = [{ command: "/start", description: "Start" }];

      (cmdRepo as any).findByBotId.resolves(commands);

      const result = await service.getCommands(botId);

      expect(result).to.deep.equal(commands);
    });
  });

  describe("getBotByToken", () => {
    it("should return bot when active and found", async () => {
      const bot = { id: botId, token: "valid-token", isActive: true };

      (botRepo as any).findByToken.resolves(bot);

      const result = await service.getBotByToken("valid-token");

      expect(result).to.deep.equal(bot);
    });

    it("should throw NotFoundException when bot not found", async () => {
      (botRepo as any).findByToken.resolves(null);

      try {
        await service.getBotByToken("invalid-token");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });
});
