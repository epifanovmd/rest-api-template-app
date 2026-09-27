import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockEmitter } from "../../test/helpers";
import { MessageCreatedEvent } from "../message/events";
import { BotListener } from "./bot.listener";
import { BotWebhookDisabledEvent } from "./events";

describe("BotListener", () => {
  const chatId = "00000000-0000-0000-0000-00000000000c";
  const humanId = "00000000-0000-0000-0000-000000000001";
  const botUserId = "00000000-0000-0000-0000-0000000000b1";
  const otherBotUserId = "00000000-0000-0000-0000-0000000000b2";

  let handlers: Map<unknown, (event: unknown) => Promise<void>>;
  let botRepo: { findWebhookBotsByUserIds: sinon.SinonStub };
  let memberRepo: { getMemberUserIds: sinon.SinonStub };
  let webhook: { enqueueEvent: sinon.SinonStub };
  let emitter: ReturnType<typeof createMockEmitter>;

  const bot = (userId: string) => ({
    id: `bot-${userId}`,
    userId,
    isActive: true,
    webhookUrl: "https://example.com/hook",
  });

  beforeEach(() => {
    handlers = new Map();
    const eventBus = {
      on: (type: unknown, fn: (event: unknown) => Promise<void>) => {
        handlers.set(type, fn);
      },
    };

    botRepo = { findWebhookBotsByUserIds: sinon.stub().resolves([]) };
    memberRepo = {
      getMemberUserIds: sinon.stub().resolves([humanId, botUserId]),
    };
    webhook = { enqueueEvent: sinon.stub().resolves("job-id") };
    emitter = createMockEmitter();

    new BotListener(
      eventBus as any,
      botRepo as any,
      memberRepo as any,
      webhook as any,
      emitter as any,
    ).register();
  });

  const emitMessage = (senderId: string) =>
    handlers.get(MessageCreatedEvent)!(
      new MessageCreatedEvent(
        { id: "m1", senderId, content: "hi", type: "text" } as any,
        chatId,
        [humanId, botUserId],
      ),
    );

  it("ищет ботов среди участников чата, а не среди ботов владельцев", async () => {
    botRepo.findWebhookBotsByUserIds.resolves([bot(botUserId)]);

    await emitMessage(humanId);

    expect(memberRepo.getMemberUserIds.calledOnceWith(chatId)).to.be.true;
    expect(
      botRepo.findWebhookBotsByUserIds.calledOnceWith([humanId, botUserId]),
    ).to.be.true;
    expect(webhook.enqueueEvent.calledOnce).to.be.true;
    expect(webhook.enqueueEvent.firstCall.args[0].userId).to.equal(botUserId);
  });

  it("бот не получает собственные сообщения", async () => {
    botRepo.findWebhookBotsByUserIds.resolves([
      bot(botUserId),
      bot(otherBotUserId),
    ]);

    await emitMessage(botUserId);

    expect(webhook.enqueueEvent.calledOnce).to.be.true;
    expect(webhook.enqueueEvent.firstCall.args[0].userId).to.equal(
      otherBotUserId,
    );
  });

  it("бот без вебхука пропускается", async () => {
    botRepo.findWebhookBotsByUserIds.resolves([
      { ...bot(botUserId), webhookUrl: null },
    ]);

    await emitMessage(humanId);

    expect(webhook.enqueueEvent.called).to.be.false;
  });

  it("ставит доставку в очередь, а не отправляет в процессе", async () => {
    botRepo.findWebhookBotsByUserIds.resolves([bot(botUserId)]);

    await emitMessage(humanId);

    const [target, eventType, payload] = webhook.enqueueEvent.firstCall.args;

    expect(target.userId).to.equal(botUserId);
    expect(eventType).to.equal("message");
    expect(payload).to.include({ messageId: "m1", chatId });
  });

  it("отключение вебхука уведомляет владельца по сокету", async () => {
    await handlers.get(BotWebhookDisabledEvent)!(
      new BotWebhookDisabledEvent("bot-1", "owner-1", 10, "HTTP 500"),
    );

    expect(
      emitter.toUser.calledOnceWith("owner-1", "bot:webhook-disabled", {
        botId: "bot-1",
        failureCount: 10,
        lastError: "HTTP 500",
      }),
    ).to.be.true;
  });
});
