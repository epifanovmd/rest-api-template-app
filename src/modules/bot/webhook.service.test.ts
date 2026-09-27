import "reflect-metadata";

import { expect } from "chai";
import crypto from "crypto";
import dns from "dns";
import http from "http";
import https from "https";
import sinon from "sinon";

import { logger } from "../../core";
import {
  createMockEventBus,
  createMockJobQueue,
  createMockRepository,
} from "../../test/helpers";
import { BotWebhookErrorCode } from "./bot.errors";
import {
  BOT_WEBHOOK_QUEUE,
  IBotWebhookJobData,
  WEBHOOK_FAILURE_THRESHOLD,
} from "./bot.types";
import { BotWebhookDisabledEvent } from "./events";
import { WebhookService } from "./webhook.service";

describe("WebhookService", () => {
  let service: WebhookService;
  let sandbox: sinon.SinonSandbox;
  let httpRequest: sinon.SinonStub;
  let httpsRequest: sinon.SinonStub;
  let lookup: sinon.SinonStub;
  let logRepo: ReturnType<typeof createMockRepository> & {
    findPageByBotId: sinon.SinonStub;
  };
  let botRepo: ReturnType<typeof createMockRepository> & {
    resetWebhookFailures: sinon.SinonStub;
    incrementWebhookFailures: sinon.SinonStub;
    disableWebhookIfFailing: sinon.SinonStub;
  };
  let jobs: ReturnType<typeof createMockJobQueue>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  const makeBot = (overrides: Record<string, unknown> = {}): any => ({
    id: "bot-1",
    ownerId: "owner-1",
    isActive: true,
    webhookUrl: "http://example.com/webhook",
    webhookSecret: "test-secret",
    webhookEvents: [],
    webhookDisabledAt: null,
    ...overrides,
  });

  const jobData = (
    overrides: Partial<IBotWebhookJobData> = {},
  ): IBotWebhookJobData => ({
    botId: "bot-1",
    deliveryId: "delivery-1",
    eventType: "message",
    payload: { text: "hi" },
    timestamp: 1_700_000_000_000,
    ...overrides,
  });

  /** Ответ сервера с заданным статусом; тело запроса пишется в `req.write`. */
  const respondWith = (stub: sinon.SinonStub, statusCode = 200) => {
    stub.callsFake((_opts: unknown, callback: (res: unknown) => void) => {
      const req: any = {
        on: sinon.stub().returnsThis(),
        write: sinon.stub(),
        end: sinon.stub().callsFake(() => {
          callback({ resume: sinon.stub(), statusCode });
        }),
        destroy: sinon.stub(),
      };

      return req;
    });
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    logRepo = Object.assign(createMockRepository(), {
      findPageByBotId: sandbox.stub().resolves([[], 0]),
    });
    botRepo = Object.assign(createMockRepository(), {
      resetWebhookFailures: sandbox.stub().resolves(),
      incrementWebhookFailures: sandbox.stub().resolves(1),
      disableWebhookIfFailing: sandbox.stub().resolves(false),
    });
    botRepo.findOne.resolves(makeBot());
    jobs = createMockJobQueue();
    eventBus = createMockEventBus();

    service = new WebhookService(
      logRepo as any,
      botRepo as any,
      jobs as any,
      eventBus as any,
    );

    httpRequest = sandbox.stub(http, "request");
    httpsRequest = sandbox.stub(https, "request");
    lookup = sandbox
      .stub(dns.promises, "lookup")
      .resolves([{ address: "93.184.216.34", family: 4 }] as any);
  });

  afterEach(() => sandbox.restore());

  describe("enqueueEvent", () => {
    it("ставит задачу bot.webhook с идентификатором доставки", async () => {
      await service.enqueueEvent(makeBot(), "message", { text: "hi" });

      expect(jobs.enqueue.calledOnce).to.be.true;

      const [queue, data] = jobs.enqueue.firstCall.args;

      expect(queue).to.equal(BOT_WEBHOOK_QUEUE);
      expect(data).to.include({ botId: "bot-1", eventType: "message" });
      expect(data.deliveryId).to.be.a("string").and.not.empty;
      expect(data.payload).to.deep.equal({ text: "hi" });
      expect(httpRequest.called).to.be.false;
    });

    it("каждое событие — отдельная доставка", async () => {
      await service.enqueueEvent(makeBot(), "message", {});
      await service.enqueueEvent(makeBot(), "message", {});

      const ids = jobs.enqueue.getCalls().map(c => c.args[1].deliveryId);

      expect(ids[0]).to.not.equal(ids[1]);
    });

    it("не ставит задачу без вебхука, для отключённого вебхука и бота", async () => {
      await service.enqueueEvent(makeBot({ webhookUrl: null }), "message", {});
      await service.enqueueEvent(
        makeBot({ webhookDisabledAt: new Date() }),
        "message",
        {},
      );
      await service.enqueueEvent(makeBot({ isActive: false }), "message", {});

      expect(jobs.enqueue.called).to.be.false;
    });

    it("учитывает фильтр событий вебхука", async () => {
      const bot = makeBot({ webhookEvents: ["command"] });

      await service.enqueueEvent(bot, "message", {});
      await service.enqueueEvent(bot, "command", {});

      expect(jobs.enqueue.calledOnce).to.be.true;
      expect(jobs.enqueue.firstCall.args[1].eventType).to.equal("command");
    });
  });

  describe("attemptDelivery", () => {
    it("POST на закреплённый IP с подписью HMAC и заголовками доставки", async () => {
      respondWith(httpRequest, 200);

      const result = await service.attemptDelivery(jobData(), 2);

      expect(result?.success).to.be.true;

      const opts = httpRequest.firstCall.args[0];
      const body = httpRequest.firstCall.returnValue.write.firstCall.args[0];
      const expected = crypto
        .createHmac("sha256", "test-secret")
        .update(body)
        .digest("hex");

      expect(opts.method).to.equal("POST");
      expect(opts.hostname).to.equal("93.184.216.34");
      expect(opts.headers.Host).to.equal("example.com");
      expect(opts.headers["X-Bot-Signature"]).to.equal(expected);
      expect(opts.headers["X-Bot-Event"]).to.equal("message");
      expect(opts.headers["X-Bot-Delivery"]).to.equal("delivery-1");
      expect(opts.headers["X-Bot-Attempt"]).to.equal("3");
      expect(JSON.parse(body)).to.include({
        event: "message",
        bot_id: "bot-1",
        delivery_id: "delivery-1",
      });
    });

    it("успех пишет попытку в журнал и сбрасывает счётчик провалов", async () => {
      respondWith(httpRequest, 204);

      await service.attemptDelivery(jobData(), 0);

      const log = logRepo.createAndSave.firstCall.args[0];

      expect(log).to.include({
        botId: "bot-1",
        deliveryId: "delivery-1",
        success: true,
        statusCode: 204,
        attempts: 1,
        errorMessage: null,
      });
      expect(botRepo.resetWebhookFailures.calledOnceWith("bot-1")).to.be.true;
    });

    it("HTTP 500 — провал, попытка в журнале, счётчик не сбрасывается", async () => {
      respondWith(httpRequest, 500);

      const result = await service.attemptDelivery(jobData(), 4);

      expect(result).to.include({
        success: false,
        statusCode: 500,
        permanent: false,
      });
      expect(logRepo.createAndSave.firstCall.args[0]).to.include({
        success: false,
        attempts: 5,
        errorMessage: "HTTP 500",
      });
      expect(botRepo.resetWebhookFailures.called).to.be.false;
    });

    it("без секрета подпись пустая", async () => {
      botRepo.findOne.resolves(makeBot({ webhookSecret: null }));
      respondWith(httpRequest);

      await service.attemptDelivery(jobData(), 0);

      expect(httpRequest.firstCall.args[0].headers["X-Bot-Signature"]).to.equal(
        "",
      );
    });

    it("https: свой клиент и SNI по исходному хосту", async () => {
      botRepo.findOne.resolves(
        makeBot({ webhookUrl: "https://secure.example.com/hook" }),
      );
      respondWith(httpsRequest);

      await service.attemptDelivery(jobData(), 0);

      expect(httpRequest.called).to.be.false;
      expect(httpsRequest.firstCall.args[0].servername).to.equal(
        "secure.example.com",
      );
    });

    it("SSRF: хост резолвится в приватный адрес — окончательный провал без запроса", async () => {
      lookup.resolves([{ address: "10.0.0.5", family: 4 }]);

      const result = await service.attemptDelivery(jobData(), 0);

      expect(httpRequest.called).to.be.false;
      expect(result).to.include({ success: false, permanent: true });
      expect(logRepo.createAndSave.calledOnce).to.be.true;
    });

    it("SSRF: IP-литерал link-local блокируется", async () => {
      botRepo.findOne.resolves(
        makeBot({ webhookUrl: "http://169.254.169.254/latest" }),
      );

      const result = await service.attemptDelivery(jobData(), 0);

      expect(httpRequest.called).to.be.false;
      expect(lookup.called).to.be.false;
      expect(result?.permanent).to.be.true;
    });

    it("ошибка DNS — повторяемый провал", async () => {
      lookup.rejects(Object.assign(new Error("fail"), { code: "ENOTFOUND" }));

      const result = await service.attemptDelivery(jobData(), 0);

      expect(result).to.include({ success: false, permanent: false });
      expect(result?.errorMessage).to.contain("ENOTFOUND");
    });

    it("таймаут — повторяемый провал, запрос уничтожается", async () => {
      let req: any;

      httpRequest.callsFake(() => {
        const handlers: Record<string, () => void> = {};

        req = {
          on: sinon.stub().callsFake((event: string, cb: () => void) => {
            handlers[event] = cb;

            return req;
          }),
          write: sinon.stub(),
          end: sinon.stub().callsFake(() => handlers.timeout()),
          destroy: sinon.stub(),
        };

        return req;
      });

      const result = await service.attemptDelivery(jobData(), 0);

      expect(req.destroy.calledOnce).to.be.true;
      expect(result).to.include({ success: false, permanent: false });
    });

    it("бот удалён, вебхук снят или отключён — доставлять некому", async () => {
      botRepo.findOne.resolves(null);
      expect(await service.attemptDelivery(jobData(), 0)).to.be.null;

      botRepo.findOne.resolves(makeBot({ webhookUrl: null }));
      expect(await service.attemptDelivery(jobData(), 0)).to.be.null;

      botRepo.findOne.resolves(makeBot({ webhookDisabledAt: new Date() }));
      expect(await service.attemptDelivery(jobData(), 0)).to.be.null;

      expect(httpRequest.called).to.be.false;
      expect(logRepo.createAndSave.called).to.be.false;
    });
  });

  describe("registerFailedDelivery", () => {
    it("ниже порога — только счётчик", async () => {
      botRepo.incrementWebhookFailures.resolves(WEBHOOK_FAILURE_THRESHOLD - 1);

      await service.registerFailedDelivery("bot-1", "HTTP 500");

      expect(botRepo.incrementWebhookFailures.calledOnceWith("bot-1")).to.be
        .true;
      expect(botRepo.disableWebhookIfFailing.called).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });

    it("на пороге отключает вебхук и уведомляет владельца", async () => {
      sandbox.stub(logger, "warn");
      botRepo.incrementWebhookFailures.resolves(WEBHOOK_FAILURE_THRESHOLD);
      botRepo.disableWebhookIfFailing.resolves(true);

      await service.registerFailedDelivery("bot-1", "HTTP 500");

      expect(
        botRepo.disableWebhookIfFailing.calledOnceWith(
          "bot-1",
          WEBHOOK_FAILURE_THRESHOLD,
        ),
      ).to.be.true;

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(BotWebhookDisabledEvent);
      expect(event).to.include({
        botId: "bot-1",
        ownerId: "owner-1",
        failureCount: WEBHOOK_FAILURE_THRESHOLD,
        lastError: "HTTP 500",
      });
    });

    it("уже отключён другим воркером — событие не повторяется", async () => {
      botRepo.incrementWebhookFailures.resolves(WEBHOOK_FAILURE_THRESHOLD + 3);
      botRepo.disableWebhookIfFailing.resolves(false);

      await service.registerFailedDelivery("bot-1", null);

      expect(eventBus.emit.called).to.be.false;
    });
  });

  describe("testWebhook", () => {
    it("синхронный ping без очереди; попытка в журнале", async () => {
      respondWith(httpRequest, 200);

      const result = await service.testWebhook(makeBot());

      expect(result.success).to.be.true;
      expect(jobs.enqueue.called).to.be.false;
      expect(httpRequest.firstCall.args[0].headers["X-Bot-Event"]).to.equal(
        "ping",
      );
      expect(logRepo.createAndSave.firstCall.args[0]).to.include({
        deliveryId: null,
        eventType: "ping",
        attempts: 1,
      });
    });

    it("без URL — не отправляет запрос", async () => {
      const result = await service.testWebhook(makeBot({ webhookUrl: null }));

      expect(result.success).to.be.false;
      expect(httpRequest.called).to.be.false;
    });

    it("ошибка SSRF не бросается, а возвращается результатом", async () => {
      lookup.resolves([{ address: "127.0.0.1", family: 4 }]);

      const result = await service.testWebhook(makeBot());

      expect(result.success).to.be.false;
      expect(result.errorMessage).to.contain("приватный");
    });
  });

  describe("getLogs", () => {
    it("страница с нормализованной пагинацией", async () => {
      logRepo.findPageByBotId.resolves([
        [
          {
            id: "log-1",
            deliveryId: "d",
            eventType: "message",
            payload: null,
            statusCode: 200,
            success: true,
            errorMessage: null,
            attempts: 1,
            durationMs: 5,
            createdAt: new Date(),
          },
        ],
        41,
      ]);

      const page = await service.getLogs("bot-1", -5, 1000);

      expect(
        logRepo.findPageByBotId.calledOnceWith("bot-1", {
          offset: 0,
          limit: 100,
        }),
      ).to.be.true;
      expect(page).to.include({ total: 41, offset: 0, limit: 100 });
      expect(page.items[0]).to.include({ id: "log-1", deliveryId: "d" });
    });
  });

  it("коды ошибок доставки — с префиксом BOT_WEBHOOK", () => {
    for (const code of Object.values(BotWebhookErrorCode)) {
      expect(code.startsWith("BOT_WEBHOOK_")).to.be.true;
    }
  });
});
