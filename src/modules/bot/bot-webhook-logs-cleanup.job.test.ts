import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { logger } from "../../core";
import {
  BOT_WEBHOOK_LOG_RETENTION_DAYS,
  BOT_WEBHOOK_LOGS_CLEANUP_QUEUE,
} from "./bot.types";
import { BotWebhookLogsCleanupJob } from "./bot-webhook-logs-cleanup.job";
import { WebhookService } from "./webhook.service";

describe("BotWebhookLogsCleanupJob", () => {
  let webhooks: { cleanupLogs: sinon.SinonStub };

  beforeEach(() => {
    webhooks = { cleanupLogs: sinon.stub().resolves(0) };
  });

  afterEach(() => sinon.restore());

  it("периодическая задача раз в сутки", () => {
    const { definition } = new BotWebhookLogsCleanupJob(webhooks as any);

    expect(definition.queue).to.equal(BOT_WEBHOOK_LOGS_CLEANUP_QUEUE);
    expect(definition.queue).to.equal("bot.webhook-logs-cleanup");
    // минуты и часы фиксированы, остальные поля — «каждый»
    expect(definition.cron).to.match(/^\d+ \d+ \* \* \*$/);
  });

  it("удаляет логи старше 30 дней", async () => {
    sinon.stub(logger, "info");
    webhooks.cleanupLogs.resolves(7);

    await new BotWebhookLogsCleanupJob(webhooks as any).handle();

    expect(BOT_WEBHOOK_LOG_RETENTION_DAYS).to.equal(30);
    expect(webhooks.cleanupLogs.calledOnceWith(30)).to.be.true;
  });

  it("ошибка пробрасывается в очередь", async () => {
    webhooks.cleanupLogs.rejects(new Error("db down"));

    try {
      await new BotWebhookLogsCleanupJob(webhooks as any).handle();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.equal("db down");
    }
  });
});

describe("WebhookService.cleanupLogs", () => {
  it("удаляет записи журнала старше срока хранения", async () => {
    const clock = sinon.useFakeTimers(new Date("2026-03-31T12:00:00Z"));
    const logRepo = { deleteOlderThan: sinon.stub().resolves(3) };
    const service = new WebhookService(
      logRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );

    try {
      expect(await service.cleanupLogs(30)).to.equal(3);

      const [before] = logRepo.deleteOlderThan.firstCall.args;

      expect(before.toISOString()).to.equal("2026-03-01T12:00:00.000Z");
    } finally {
      clock.restore();
    }
  });
});
