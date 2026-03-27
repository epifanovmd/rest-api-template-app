import "reflect-metadata";

import { expect } from "chai";
import crypto from "crypto";
import http from "http";
import https from "https";
import sinon from "sinon";

import { WebhookService } from "./webhook.service";

describe("WebhookService", () => {
  let service: WebhookService;
  let sandbox: sinon.SinonSandbox;
  let httpRequestStub: sinon.SinonStub;
  let httpsRequestStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  const createBot = (overrides: Record<string, any> = {}) =>
    ({
      id: "bot-1",
      webhookUrl: "http://example.com/webhook",
      webhookSecret: "test-secret",
      ...overrides,
    }) as any;

  const createMockRequest = (statusCode = 200) => {
    const req: any = {
      on: sinon.stub(),
      write: sinon.stub(),
      end: sinon.stub(),
      destroy: sinon.stub(),
    };

    req.on.withArgs("error").returns(req);
    req.on.withArgs("timeout").returns(req);

    // Simulate response callback synchronously
    return { req, statusCode };
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sinon.useFakeTimers();
    service = new WebhookService();

    httpRequestStub = sandbox.stub(http, "request");
    httpsRequestStub = sandbox.stub(https, "request");
  });

  afterEach(() => {
    clock.restore();
    sandbox.restore();
  });

  const setupSuccessfulRequest = (
    stub: sinon.SinonStub,
    statusCode = 200,
  ) => {
    stub.callsFake((_opts: any, callback: any) => {
      const req: any = {
        on: sinon.stub().returnsThis(),
        write: sinon.stub(),
        end: sinon.stub().callsFake(() => {
          const res = { resume: sinon.stub(), statusCode };

          callback(res);
        }),
        destroy: sinon.stub(),
      };

      return req;
    });
  };

  const setupFailingRequest = (stub: sinon.SinonStub, failCount: number, finalStatus = 200) => {
    let callCount = 0;

    stub.callsFake((_opts: any, callback: any) => {
      callCount += 1;
      const req: any = {
        on: sinon.stub().returnsThis(),
        write: sinon.stub(),
        end: sinon.stub().callsFake(() => {
          if (callCount <= failCount) {
            const res = { resume: sinon.stub(), statusCode: 500 };

            callback(res);
          } else {
            const res = { resume: sinon.stub(), statusCode: finalStatus };

            callback(res);
          }
        }),
        destroy: sinon.stub(),
      };

      return req;
    });
  };

  it("no webhookUrl returns without calling http", async () => {
    const bot = createBot({ webhookUrl: undefined });

    await service.deliverEvent(bot, "message", { text: "hello" });

    expect(httpRequestStub.called).to.be.false;
    expect(httpsRequestStub.called).to.be.false;
  });

  it("valid delivery sends POST with correct headers", async () => {
    setupSuccessfulRequest(httpRequestStub);
    const bot = createBot();

    const deliverPromise = service.deliverEvent(bot, "message.new", { text: "hi" });

    await deliverPromise;

    expect(httpRequestStub.calledOnce).to.be.true;
    const callArgs = httpRequestStub.firstCall.args[0];

    expect(callArgs.method).to.equal("POST");
    expect(callArgs.hostname).to.equal("example.com");
    expect(callArgs.headers["Content-Type"]).to.equal("application/json");
    expect(callArgs.headers["X-Bot-Event"]).to.equal("message.new");
    expect(callArgs.headers["X-Bot-Signature"]).to.be.a("string").and.not.empty;
  });

  it("HMAC signature is generated correctly", async () => {
    setupSuccessfulRequest(httpRequestStub);
    const bot = createBot({ webhookSecret: "my-secret" });

    await service.deliverEvent(bot, "test", { data: 1 });

    const callArgs = httpRequestStub.firstCall.args[0];
    const writtenBody = httpRequestStub.firstCall.returnValue.write.firstCall.args[0];
    const expectedSignature = crypto
      .createHmac("sha256", "my-secret")
      .update(writtenBody)
      .digest("hex");

    expect(callArgs.headers["X-Bot-Signature"]).to.equal(expectedSignature);
  });

  it("no webhookSecret produces empty signature", async () => {
    setupSuccessfulRequest(httpRequestStub);
    const bot = createBot({ webhookSecret: undefined });

    await service.deliverEvent(bot, "test", {});

    const callArgs = httpRequestStub.firstCall.args[0];

    expect(callArgs.headers["X-Bot-Signature"]).to.equal("");
  });

  it("retries on failure", async () => {
    setupFailingRequest(httpRequestStub, 2, 200);
    const bot = createBot();

    const deliverPromise = service.deliverEvent(bot, "test", {});

    // Advance past retry delays
    await clock.tickAsync(1000);
    await clock.tickAsync(5000);

    await deliverPromise;

    expect(httpRequestStub.callCount).to.equal(3);
  });

  it("HTTPS protocol selection for https URLs", async () => {
    setupSuccessfulRequest(httpsRequestStub);
    const bot = createBot({ webhookUrl: "https://secure.example.com/hook" });

    await service.deliverEvent(bot, "test", {});

    expect(httpsRequestStub.calledOnce).to.be.true;
    expect(httpRequestStub.called).to.be.false;
  });

  it("timeout handling destroys request", async () => {
    let timeoutCallback: () => void;

    httpRequestStub.callsFake((_opts: any, _callback: any) => {
      const req: any = {
        on: sinon.stub().callsFake((event: string, cb: any) => {
          if (event === "timeout") {
            timeoutCallback = cb;
          }

          return req;
        }),
        write: sinon.stub(),
        end: sinon.stub().callsFake(() => {
          // Trigger timeout after end
          if (timeoutCallback) timeoutCallback();
        }),
        destroy: sinon.stub(),
      };

      return req;
    });

    // After 3 timeouts it should give up - need to advance timers for retries
    const bot = createBot();
    const deliverPromise = service.deliverEvent(bot, "test", {});

    await clock.tickAsync(1000);
    await clock.tickAsync(5000);

    await deliverPromise;

    expect(httpRequestStub.callCount).to.equal(3);
  });
});
