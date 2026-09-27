import "reflect-metadata";

import { expect } from "chai";
import { EventEmitter } from "events";
import sinon from "sinon";

import { JobsController } from "./jobs.controller";
import { JobsWorkerController } from "./jobs-worker.controller";

const request = (user: Record<string, unknown>) => {
  const req = new EventEmitter();

  return { ctx: { request: { user }, req, state: {} } } as any;
};

describe("JobsWorkerController", () => {
  const service = {
    claim: sinon.stub().resolves([]),
    heartbeat: sinon.stub().resolves({ cancel: false }),
    complete: sinon.stub().resolves(),
    fail: sinon.stub().resolves(),
    workersStatus: sinon
      .stub()
      .resolves([{ queue: "demo.echo", online: true, workers: [] }]),
  };
  const controller = new JobsWorkerController(service as any);
  const serviceUser = {
    kind: "service",
    permissions: ["worker:demo.echo"],
    sessionId: "apikey:k1",
  };

  beforeEach(() => Object.values(service).forEach(stub => stub.resetHistory()));

  it("claim: scopes ключа, сигнал обрыва соединения, флаг long-poll", async () => {
    const req = request(serviceUser);

    await controller.claim(req, { queues: ["demo.echo"], waitSeconds: 10 });

    const [caller, body, signal] = service.claim.firstCall.args;

    expect(caller).to.deep.equal({
      scopes: ["worker:demo.echo"],
      keyId: "apikey:k1",
    });
    expect(body).to.deep.equal({ queues: ["demo.echo"], waitSeconds: 10 });
    expect(req.ctx.state.longPoll).to.be.true;
    expect(signal.aborted).to.be.false;
    req.ctx.req.emit("close");
    expect(signal.aborted).to.be.true;
  });

  it("status — статус внешних очередей", async () => {
    expect(await controller.status()).to.deep.equal([
      { queue: "demo.echo", online: true, workers: [] },
    ]);
  });

  it("heartbeat возвращает ответ сервиса", async () => {
    const result = await controller.heartbeat(request(serviceUser), "job-1", {
      progress: 0.5,
    });

    expect(result).to.deep.equal({ cancel: false });
    expect(service.heartbeat.firstCall.args[1]).to.equal("job-1");
  });

  it("complete и fail — 204", async () => {
    await controller.complete(request(serviceUser), "job-1", { result: 1 });
    expect(controller.getStatus()).to.equal(204);

    await controller.fail(request(serviceUser), "job-1", {
      code: "X",
      message: "m",
      retryable: false,
    });
    expect(service.fail.firstCall.args[2]).to.deep.include({
      retryable: false,
    });
  });
});

describe("JobsController", () => {
  const service = {
    list: sinon.stub().resolves({ items: [], total: 0, offset: 0, limit: 20 }),
    get: sinon.stub().resolves({ id: "job-1" }),
    cancel: sinon.stub().resolves(),
  };
  const controller = new JobsController(service as any);

  it("передаёт зрителя: суперпользователь по роли admin", async () => {
    await controller.listJobs(
      request({ userId: "u1", roles: ["admin"], permissions: [] }),
      undefined,
      "workspace",
      "w1",
    );

    expect(service.list.firstCall.args[0]).to.deep.equal({
      userId: "u1",
      isSuperUser: true,
    });
    expect(service.list.firstCall.args[1]).to.include({
      scopeType: "workspace",
      scopeId: "w1",
    });
  });

  it("cancel — 204", async () => {
    await controller.cancelJob(
      request({ userId: "u1", roles: [], permissions: [] }),
      "job-1",
    );

    expect(service.cancel.firstCall.args).to.deep.equal([
      { userId: "u1", isSuperUser: false },
      "job-1",
    ]);
    expect(controller.getStatus()).to.equal(204);
  });
});
