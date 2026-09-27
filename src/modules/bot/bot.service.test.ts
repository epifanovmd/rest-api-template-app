import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";
import { QueryFailedError } from "typeorm";

import { ForbiddenException, HttpException } from "../../core/http";
import {
  createMockEventBus,
  createMockFileStorage,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { EMessageType } from "../message";
import { Profile } from "../profile/profile.entity";
import { User } from "../user/user.entity";
import { Bot } from "./bot.entity";
import { BotService } from "./bot.service";
import { BotCommand } from "./bot-command.entity";

/** Промис отклонён HTTP-исключением с указанным кодом. */
const expectRejects = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
  } catch (err) {
    expect(err).to.be.instanceOf(HttpException);
    expect((err as HttpException).code).to.equal(code);

    return;
  }

  expect.fail("Should have thrown");
};

describe("BotService", () => {
  let service: BotService;
  let botRepo: any;
  let cmdRepo: any;
  let chatService: any;
  let messageService: any;
  let messageRepo: any;
  let txRepos: Map<unknown, any>;

  const ownerId = uuid();
  const botId = uuid2();
  const botUserId = uuid3();
  const chatId = "00000000-0000-0000-0000-00000000000c";
  const messageId = "00000000-0000-0000-0000-00000000000d";

  const makeBot = (overrides: Record<string, unknown> = {}): any => ({
    id: botId,
    ownerId,
    userId: botUserId,
    isActive: true,
    ...overrides,
  });

  beforeEach(() => {
    botRepo = createMockRepository();
    cmdRepo = createMockRepository();

    botRepo.findByUsername = sinon.stub().resolves(null);
    botRepo.findPageByOwnerId = sinon.stub().resolves([[], 0]);
    botRepo.findByIdWithDetails = sinon.stub().resolves(null);
    botRepo.findByToken = sinon.stub().resolves(null);
    cmdRepo.findByBotId = sinon.stub().resolves([]);

    txRepos = new Map();

    for (const entity of [User, Profile, Bot, BotCommand]) {
      const repo = createMockRepository();

      repo.save = sinon
        .stub()
        .callsFake((data: any) =>
          Promise.resolve(
            entity === User ? { id: botUserId, ...data } : { ...data },
          ),
        );
      txRepos.set(entity, repo);
    }

    chatService = {
      addMembers: sinon.stub().resolves([]),
      removeMember: sinon.stub().resolves(botUserId),
      isMember: sinon.stub().resolves(true),
    };
    messageService = {
      sendMessage: sinon.stub().resolves({ id: messageId }),
      editMessage: sinon.stub().resolves({ id: messageId }),
      deleteMessage: sinon.stub().resolves(),
    };
    messageRepo = createMockRepository();
    messageRepo.findById = sinon.stub().resolves({ id: messageId, chatId });

    service = new BotService(
      botRepo,
      cmdRepo,
      {
        transaction: sinon.stub().callsFake((cb: any) =>
          cb({
            getRepository: (entity: unknown) => txRepos.get(entity),
          }),
        ),
      } as any,
      createMockEventBus() as any,
      chatService,
      messageService,
      messageRepo,
      new FileUrlService(createMockFileStorage() as any),
    );
  });

  afterEach(() => sinon.restore());

  describe("createBot", () => {
    it("создаёт технического пользователя с профилем и связывает с ботом", async () => {
      const data = { username: "testbot", displayName: "Test Bot" };

      botRepo.findByIdWithDetails.resolves(makeBot(data));

      const result = await service.createBot(ownerId, data);

      const userData = txRepos.get(User).create.firstCall.args[0];

      expect(userData.email ?? null).to.be.null;
      expect(userData.phone ?? null).to.be.null;
      expect(userData.passwordHash).to.be.a("string");

      const profileData = txRepos.get(Profile).create.firstCall.args[0];

      expect(profileData.userId).to.equal(botUserId);
      expect(profileData.firstName).to.equal("Test Bot");

      const botData = txRepos.get(Bot).create.firstCall.args[0];

      expect(botData.ownerId).to.equal(ownerId);
      expect(botData.userId).to.equal(botUserId);
      expect(botData.token).to.be.a("string").and.have.length.greaterThan(0);
      expect(result).to.have.property("userId", botUserId);
    });

    it("409 BOT_USERNAME_TAKEN, если username занят", async () => {
      botRepo.findByUsername.resolves({ id: "existing-bot" });

      await expectRejects(
        service.createBot(ownerId, { username: "taken", displayName: "Bot" }),
        "BOT_USERNAME_TAKEN",
      );
    });
  });

  describe("createBot: гонка за username", () => {
    it("нарушение уникальности → 409 BOT_USERNAME_TAKEN", async () => {
      txRepos.get(User).save = sinon
        .stub()
        .rejects(new QueryFailedError("INSERT", [], { code: "23505" } as any));

      await expectRejects(
        service.createBot(ownerId, { username: "race", displayName: "Bot" }),
        "BOT_USERNAME_TAKEN",
      );
    });
  });

  describe("getBotById", () => {
    it("возвращает бота владельцу", async () => {
      botRepo.findByIdWithDetails.resolves(makeBot());

      expect(await service.getBotById(botId, ownerId)).to.have.property(
        "id",
        botId,
      );
    });

    it("403 для не владельца", async () => {
      botRepo.findByIdWithDetails.resolves(makeBot({ ownerId: "other" }));

      await expectRejects(
        service.getBotById(botId, ownerId),
        "BOT_ACCESS_DENIED",
      );
    });

    it("404, если бота нет", async () => {
      await expectRejects(service.getBotById(botId, ownerId), "BOT_NOT_FOUND");
    });
  });

  describe("updateBot", () => {
    it("обновляет поля и имя в профиле технического пользователя", async () => {
      const bot = makeBot({ displayName: "Old", description: "Old desc" });

      botRepo.findByIdWithDetails.resolves(bot);

      await service.updateBot(botId, ownerId, {
        displayName: "New",
        description: "New desc",
      });

      expect(bot.displayName).to.equal("New");
      expect(bot.description).to.equal("New desc");
      expect(
        txRepos
          .get(Profile)
          .update.calledOnceWith({ userId: botUserId }, { firstName: "New" }),
      ).to.be.true;
    });
  });

  describe("deleteBot", () => {
    it("удаляет бота и его технического пользователя", async () => {
      botRepo.findByIdWithDetails.resolves(makeBot());

      await service.deleteBot(botId, ownerId);

      expect(txRepos.get(Bot).delete.calledOnceWith({ id: botId })).to.be.true;
      expect(txRepos.get(User).delete.calledOnceWith({ id: botUserId })).to.be
        .true;
    });
  });

  describe("regenerateToken", () => {
    it("генерирует новый токен", async () => {
      const bot = makeBot({ token: "old-token" });

      botRepo.findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      const result = await service.regenerateToken(botId, ownerId);

      expect(result.token).to.not.equal("old-token");
    });
  });

  describe("webhook", () => {
    it("setWebhook сохраняет url и генерирует секрет", async () => {
      const bot = makeBot({ webhookUrl: null, webhookSecret: null });

      botRepo.findByIdWithDetails.resolves(bot);
      botRepo.save.resolves(bot);

      const result = await service.setWebhook(
        botId,
        ownerId,
        "https://example.com/hook",
      );

      expect(result.webhookUrl).to.equal("https://example.com/hook");
      expect(result.webhookSecret).to.be.a("string").and.not.empty;
    });

    it("deleteWebhook очищает url и секрет", async () => {
      const bot = makeBot({ webhookUrl: "https://x", webhookSecret: "s" });

      botRepo.findByIdWithDetails.resolves(bot);

      await service.deleteWebhook(botId, ownerId);

      expect(bot.webhookUrl).to.be.null;
      expect(bot.webhookSecret).to.be.null;
    });

    it("setWebhook снова включает автоматически отключённый вебхук", async () => {
      const bot = makeBot({
        webhookUrl: "https://old",
        webhookFailureCount: 10,
        webhookDisabledAt: new Date(),
      });

      botRepo.findByIdWithDetails.resolves(bot);

      await service.setWebhook(botId, ownerId, "https://example.com/hook");

      expect(bot.webhookDisabledAt).to.be.null;
      expect(bot.webhookFailureCount).to.equal(0);
    });
  });

  describe("getMyBots", () => {
    it("страница ботов владельца с нормализованной пагинацией", async () => {
      botRepo.findPageByOwnerId.resolves([
        [makeBot({ username: "b", displayName: "B", createdAt: new Date() })],
        7,
      ]);

      const page = await service.getMyBots(ownerId, 5, 0);

      expect(
        botRepo.findPageByOwnerId.calledOnceWith(ownerId, {
          offset: 5,
          limit: 20,
        }),
      ).to.be.true;
      expect(page).to.include({ total: 7, offset: 5, limit: 20 });
      expect(page.items[0]).to.include({ id: botId, username: "b" });
    });
  });

  describe("commands", () => {
    it("setCommands заменяет команды", async () => {
      const commands = [{ command: "/start", description: "Start bot" }];

      botRepo.findByIdWithDetails.resolves(makeBot());
      cmdRepo.findByBotId.resolves(commands);

      const result = await service.setCommands(botId, ownerId, commands);

      expect(txRepos.get(BotCommand).delete.calledOnceWith({ botId })).to.be
        .true;
      expect(result).to.deep.equal(commands);
    });
  });

  describe("findByToken / getBotByToken", () => {
    it("findByToken возвращает бота или null", async () => {
      botRepo.findByToken.resolves(makeBot());

      expect(await service.findByToken("valid")).to.have.property("id", botId);

      botRepo.findByToken.resolves(null);

      expect(await service.findByToken("invalid")).to.be.null;
    });

    it("findByToken не ходит в БД с пустым токеном", async () => {
      expect(await service.findByToken("")).to.be.null;
      expect(botRepo.findByToken.called).to.be.false;
    });

    it("getBotByToken: неверный токен → 401", async () => {
      await expectRejects(
        service.getBotByToken("invalid-token"),
        "BOT_INVALID_TOKEN",
      );
    });
  });

  describe("addBotToChat / removeBotFromChat", () => {
    it("добавляет технического пользователя бота в чат от имени актёра", async () => {
      botRepo.findOne.resolves(makeBot());

      await service.addBotToChat(botId, chatId, ownerId);

      expect(
        chatService.addMembers.calledOnceWith(chatId, ownerId, [botUserId]),
      ).to.be.true;
    });

    it("404 для несуществующего бота", async () => {
      await expectRejects(
        service.addBotToChat(botId, chatId, ownerId),
        "BOT_NOT_FOUND",
      );
      expect(chatService.addMembers.called).to.be.false;
    });

    it("400 для отключённого бота", async () => {
      botRepo.findOne.resolves(makeBot({ isActive: false }));

      await expectRejects(
        service.addBotToChat(botId, chatId, ownerId),
        "BOT_INACTIVE",
      );
    });

    it("права проверяет ChatService (403 пробрасывается)", async () => {
      botRepo.findOne.resolves(makeBot());
      chatService.addMembers.rejects(
        new ForbiddenException("Недостаточно прав"),
      );

      await expectRejects(
        service.addBotToChat(botId, chatId, "stranger"),
        "FORBIDDEN",
      );
    });

    it("удаляет бота из чата", async () => {
      botRepo.findOne.resolves(makeBot());

      await service.removeBotFromChat(botId, chatId, ownerId);

      expect(
        chatService.removeMember.calledOnceWith(chatId, ownerId, botUserId),
      ).to.be.true;
    });
  });

  describe("bot-API", () => {
    const bot = makeBot() as any;

    it("sendMessage шлёт от bot.userId как TEXT", async () => {
      await service.sendMessage(bot, { chatId, content: "hi" });

      expect(chatService.isMember.calledOnceWith(chatId, botUserId)).to.be.true;

      const [sentChatId, senderId, data] =
        messageService.sendMessage.firstCall.args;

      expect(sentChatId).to.equal(chatId);
      expect(senderId).to.equal(botUserId);
      expect(data.type).to.equal(EMessageType.TEXT);
      expect(data).to.not.have.property("fileIds");
    });

    it("sendMessage: 403, если бот не участник чата", async () => {
      chatService.isMember.resolves(false);

      await expectRejects(
        service.sendMessage(bot, { chatId, content: "hi" }),
        "BOT_NOT_CHAT_MEMBER",
      );
      expect(messageService.sendMessage.called).to.be.false;
    });

    it("editMessage: от bot.userId и только в чате, где бот участник", async () => {
      await service.editMessage(bot, messageId, "new");

      expect(chatService.isMember.calledOnceWith(chatId, botUserId)).to.be.true;
      expect(
        messageService.editMessage.calledOnceWith(messageId, botUserId, "new"),
      ).to.be.true;

      chatService.isMember.resolves(false);

      await expectRejects(
        service.editMessage(bot, messageId, "new"),
        "BOT_NOT_CHAT_MEMBER",
      );
    });

    it("deleteMessage: 404 для несуществующего сообщения", async () => {
      messageRepo.findById.resolves(null);

      await expectRejects(
        service.deleteMessage(bot, messageId),
        "BOT_MESSAGE_NOT_FOUND",
      );
    });

    it("deleteMessage удаляет для всех от bot.userId", async () => {
      await service.deleteMessage(bot, messageId);

      expect(
        messageService.deleteMessage.calledOnceWith(messageId, botUserId, true),
      ).to.be.true;
    });
  });
});
