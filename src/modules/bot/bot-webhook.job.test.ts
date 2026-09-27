import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { JobContext, JobError } from "../../core";
import {
  BOT_WEBHOOK_QUEUE,
  IBotWebhookJobData,
  IWebhookAttemptResult,
  WEBHOOK_MAX_ATTEMPTS,
} from "./bot.types";
import { BotWebhookJob } from "./bot-webhook.job";

describe("BotWebhookJob", () => {
  let webhooks: {
    attemptDelivery: sinon.SinonStub;
    registerFailedDelivery: sinon.SinonStub;
  };
  let job: BotWebhookJob;

  const data: IBotWebhookJobData = {
    botId: "bot-1",
    deliveryId: "delivery-1",
    eventType: "message",
    payload: {},
    timestamp: 1,
  };

  const ctx = (attempt: number): JobContext<IBotWebhookJobData> => ({
    id: "job-1",
    queue: BOT_WEBHOOK_QUEUE,
    data,
    attempt,
    signal: new AbortController().signal,
    progress: async () => {},
    log: async () => {},
  });

  const failure = (
    overrides: Partial<IWebhookAttemptResult> = {},
  ): IWebhookAttemptResult => ({
    success: false,
    statusCode: 500,
    errorMessage: "HTTP 500",
    durationMs: 3,
    permanent: false,
    ...overrides,
  });

  const catchJobError = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (err) {
      expect(err).to.be.instanceOf(JobError);

      return err as JobError;
    }

    return expect.fail("Задача должна была упасть");
  };

  beforeEach(() => {
    webhooks = {
      attemptDelivery: sinon.stub().resolves({ ...failure(), success: true }),
      registerFailedDelivery: sinon.stub().resolves(),
    };
    job = new BotWebhookJob(webhooks as any);
  });

  it("6 попыток с экспоненциальным backoff от 5 секунд", () => {
    expect(job.definition).to.include({
      queue: BOT_WEBHOOK_QUEUE,
      retryLimit: WEBHOOK_MAX_ATTEMPTS - 1,
      retryDelaySeconds: 5,
      retryBackoff: true,
    });
    expect(WEBHOOK_MAX_ATTEMPTS).to.equal(6);
  });

  it("успешная доставка завершает задачу", async () => {
    await job.handle(ctx(0));

    expect(webhooks.attemptDelivery.calledOnceWith(data, 0)).to.be.true;
    expect(webhooks.registerFailedDelivery.called).to.be.false;
  });

  it("доставлять некому — задача завершается без ошибки", async () => {
    webhooks.attemptDelivery.resolves(null);

    await job.handle(ctx(0));

    expect(webhooks.registerFailedDelivery.called).to.be.false;
  });

  it("провал не последней попытки — повторяемая ошибка, серия не растёт", async () => {
    webhooks.attemptDelivery.resolves(failure());

    const err = await catchJobError(job.handle(ctx(0)));

    expect(err.retryable).to.be.true;
    expect(err.code).to.equal("BOT_WEBHOOK_DELIVERY_FAILED");
    expect(webhooks.registerFailedDelivery.called).to.be.false;
  });

  it("провал последней попытки засчитывается в серию", async () => {
    webhooks.attemptDelivery.resolves(failure());

    const err = await catchJobError(job.handle(ctx(WEBHOOK_MAX_ATTEMPTS - 1)));

    expect(err.retryable).to.be.false;
    expect(webhooks.registerFailedDelivery.calledOnceWith("bot-1", "HTTP 500"))
      .to.be.true;
  });

  it("заблокированный адрес — без повторов, сразу в серию", async () => {
    webhooks.attemptDelivery.resolves(
      failure({ permanent: true, errorMessage: "blocked" }),
    );

    const err = await catchJobError(job.handle(ctx(0)));

    expect(err.retryable).to.be.false;
    expect(webhooks.registerFailedDelivery.calledOnceWith("bot-1", "blocked"))
      .to.be.true;
  });
});
