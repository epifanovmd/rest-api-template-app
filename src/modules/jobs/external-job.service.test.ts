import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { JobError } from "../../core";
import { ExternalJobService } from "./external-job.service";
import { EJobRunStatus } from "./jobs.types";

const run = (patch: object = {}) => ({
  id: "r1",
  queue: "demo.echo",
  status: EJobRunStatus.QUEUED,
  attempt: 0,
  agentId: null,
  worker: null,
  externalId: null,
  startedAt: null,
  cancelRequested: false,
  logTail: [],
  ...patch,
});

const assigned = (patch: object = {}) =>
  run({
    status: EJobRunStatus.RUNNING,
    agentId: "a1",
    worker: "echo",
    externalId: "w1",
    ...patch,
  });

const bossJob = (retryCount = 0) =>
  ({ id: "r1", data: { text: "hi" }, retryCount, retryLimit: 2 }) as any;

const update = (patch: object = {}) => ({
  agentId: "a1",
  worker: "echo",
  workId: "w1",
  kind: "progress" as const,
  ...patch,
});

describe("ExternalJobService", () => {
  let runs: Record<string, sinon.SinonStub>;
  let tracker: Record<string, sinon.SinonStub>;
  let registry: Record<string, sinon.SinonStub>;
  let executor: Record<string, any>;
  let boss: Record<string, sinon.SinonStub>;
  let storage: Record<string, sinon.SinonStub>;
  let handler: Record<string, sinon.SinonStub>;
  let service: ExternalJobService;
  const dataSource = {
    transaction: async (fn: (m: unknown) => Promise<void>) => fn({}),
  };

  const create = (withExecutor = true) =>
    new ExternalJobService(
      runs as any,
      tracker as any,
      registry as any,
      dataSource as any,
      boss as any,
      withExecutor ? (executor as any) : undefined,
      storage as any,
    );

  beforeEach(() => {
    runs = {
      findById: sinon.stub().callsFake(async () => run()),
      findByAssignment: sinon.stub().resolves(null),
      claimDispatch: sinon.stub().resolves(true),
      releaseDispatch: sinon.stub().resolves(true),
      attachExternal: sinon.stub().resolves(true),
      setTarget: sinon.stub().resolves(),
      findActiveExternalByAgent: sinon.stub().resolves([]),
      findExpiredExternal: sinon.stub().resolves([]),
      findQueuedExternalIds: sinon.stub().resolves([]),
    };
    tracker = {
      updateIfActive: sinon.stub().resolves(true),
      publish: sinon.stub(),
    };
    handler = {
      jobType: sinon.stub().returns("echo.long"),
      onComplete: sinon.stub().resolves(),
      onFail: sinon.stub().resolves(),
    };
    registry = {
      all: sinon
        .stub()
        .returns([
          { definition: { queue: "demo.echo", external: true } },
          { definition: { queue: "mail.send" } },
        ]),
      external: sinon.stub().returns(handler),
      definition: sinon.stub().returns({
        external: true,
        retryLimit: 2,
        expireInSeconds: 600,
        job: { type: "echo.quick", worker: "echo" },
      }),
    };
    executor = {
      canDispatch: true,
      dispatch: sinon.stub().resolves(update()),
      poll: sinon.stub().resolves(null),
      cancel: sinon.stub().resolves(),
      onUpdate: sinon.stub().returns(() => {}),
      onReconnect: sinon.stub().returns(() => {}),
    };
    boss = { findJobData: sinon.stub().resolves({ text: "hi" }) };
    storage = {
      signedGetUrl: sinon.stub().callsFake(async (key: string) => `get:${key}`),
      signedPutUrl: sinon.stub().callsFake(async (key: string) => `put:${key}`),
      stat: sinon.stub().resolves(null),
    };
    service = create();
  });

  it("передача: запись берётся, тип задачи — от обработчика, попытка; связь с задачей воркера и срок", async () => {
    await service.dispatch(bossJob(1));

    expect(runs.claimDispatch.firstCall.args.slice(0, 2)).to.deep.equal([
      "r1",
      1,
    ]);
    expect(executor.dispatch.firstCall.args[0]).to.deep.equal({
      jobId: "r1",
      queue: "demo.echo",
      attempt: 1,
      data: { text: "hi" },
      target: { type: "echo.long", worker: "echo" },
    });

    const [id, assignment, , deadline] = runs.attachExternal.firstCall.args;

    expect(id).to.equal("r1");
    expect(assignment).to.include({
      agentId: "a1",
      worker: "echo",
      workId: "w1",
    });
    expect(deadline.getTime() - Date.now()).to.be.closeTo(600_000, 5_000);
  });

  it("уже переданная или завершённая — повторно не передаётся; передаёт другой процесс — повтор позже", async () => {
    runs.findById.resolves(assigned());
    await service.dispatch(bossJob());
    runs.findById.resolves(run({ status: EJobRunStatus.CANCELLED }));
    await service.dispatch(bossJob());
    expect(executor.dispatch.called).to.be.false;

    runs.findById.resolves(run());
    runs.claimDispatch.resolves(false);
    await service.dispatch(bossJob()).then(
      () => expect.fail("должно было упасть"),
      (err: any) =>
        expect([err.code, err.retryable]).to.deep.equal([
          "JOB_DISPATCHING",
          true,
        ]),
    );
    expect(executor.dispatch.called).to.be.false;
  });

  it("быстрая задача: итог из ответа воркера — onComplete, без событий", async () => {
    executor.dispatch.resolves(
      update({ kind: "done", workId: "r1", result: { text: "HI" } }),
    );
    runs.findById
      .onFirstCall()
      .resolves(run())
      .onSecondCall()
      .resolves(assigned({ externalId: "r1" }));
    await service.dispatch(bossJob());

    expect(tracker.updateIfActive.lastCall.args[1]).to.deep.include({
      status: EJobRunStatus.COMPLETED,
      result: { text: "HI" },
    });
    expect(handler.onComplete.firstCall.args[1]).to.deep.equal({ text: "HI" });
  });

  it("файлы задачи: подписанные ссылки входов (GET) и выходов (PUT); ключи выходов — в onComplete", async () => {
    handler.io = sinon.stub().returns({
      inputs: { source: "in/a.txt" },
      outputs: {
        result: { key: "jobs/r1/out.txt", contentType: "text/plain" },
      },
    });
    await service.dispatch(bossJob());

    expect(executor.dispatch.firstCall.args[0].files).to.deep.equal({
      inputs: { source: "get:in/a.txt" },
      outputs: { result: "put:jobs/r1/out.txt" },
    });
    expect(storage.signedPutUrl.firstCall.args[1]).to.deep.include({
      contentType: "text/plain",
    });
    expect(storage.signedPutUrl.firstCall.args[1].ttlSeconds).to.be.at.least(
      600,
    );

    runs.findByAssignment.resolves(assigned());
    await service.apply(update({ kind: "done", result: { text: "HI" } }));
    expect(handler.onComplete.firstCall.args[0].outputs).to.deep.equal({
      result: "jobs/r1/out.txt",
    });
    expect(
      tracker.updateIfActive.lastCall.args[1].outputs,
      "воркер не загрузил файл — выхода нет",
    ).to.equal(null);
  });

  it("файлы итога: загруженные выходы с размером — в запись задачи", async () => {
    handler.io = sinon.stub().returns({
      outputs: {
        result: { key: "jobs/r1/out.txt", contentType: "text/plain" },
        log: "jobs/r1/log.txt",
      },
    });
    storage.stat.callsFake(async (key: string) =>
      key === "jobs/r1/out.txt" ? { size: 12 } : null,
    );
    runs.findByAssignment.resolves(assigned());
    await service.apply(update({ kind: "done", result: { text: "HI" } }));

    expect(tracker.updateIfActive.lastCall.args[1].outputs).to.deep.equal([
      { name: "result", key: "jobs/r1/out.txt", size: 12 },
    ]);
  });

  it("тип задачи воркера и воркер очереди — в запись до передачи", async () => {
    await service.dispatch(bossJob());

    expect(runs.setTarget.firstCall.args).to.deep.equal([
      "r1",
      { jobType: "echo.long", worker: "echo" },
    ]);
    expect(runs.setTarget.calledBefore(executor.dispatch)).to.equal(true);
  });

  it("отменили, пока задача передавалась, — отмена и у воркера", async () => {
    runs.findById.callsFake(async () => run({ cancelRequested: true }));
    runs.findById.onFirstCall().callsFake(async () => run());
    await service.dispatch(bossJob());

    expect(executor.cancel.calledOnce).to.be.true;
  });

  it("сбой передачи: есть попытки — запись снова ждёт и повтор, нет или без повторов — failed", async () => {
    executor.dispatch.rejects(new JobError("NO_AGENT", "нет агента"));

    await service.dispatch(bossJob(0)).then(
      () => expect.fail("должно было упасть"),
      (err: any) => expect(err.code).to.equal("NO_AGENT"),
    );
    expect(runs.releaseDispatch.lastCall.args[1]).to.deep.include({
      attempt: 1,
    });

    await service.dispatch(bossJob(2));
    expect(tracker.updateIfActive.lastCall.args[1]).to.deep.include({
      status: EJobRunStatus.FAILED,
    });

    executor.dispatch.rejects(new JobError("JOB_REJECTED", "400", false));
    await service.dispatch(bossJob(0));
    expect(tracker.updateIfActive.lastCall.args[1].error).to.deep.equal({
      code: "JOB_REJECTED",
      message: "400",
    });
  });

  it("без исполнителя — сразу failed (EXTERNAL_EXECUTOR_MISSING)", async () => {
    service = create(false);
    await service.dispatch(bossJob());

    expect(tracker.updateIfActive.firstCall.args[1].error.code).to.equal(
      "EXTERNAL_EXECUTOR_MISSING",
    );
  });

  it("сразу после постановки: агент на связи — задача передаётся; нет агента — ждёт повтора без ошибки", async () => {
    await service.startNow("r1");
    expect(executor.dispatch.calledOnce).to.be.true;
    expect(boss.findJobData.calledWith("r1")).to.be.true;

    executor.dispatch.rejects(new JobError("NO_AGENT", "нет агента"));
    await service.startNow("r1");
    expect(runs.releaseDispatch.calledOnce).to.be.true;

    executor.dispatch.rejects(new JobError("JOB_INVALID", "схема", false));
    await service.startNow("r1");
    expect(tracker.updateIfActive.lastCall.args[1]).to.deep.include({
      status: EJobRunStatus.FAILED,
    });
  });

  it("сразу после постановки: уже взята, не ждёт или процесс не передаёт — ничего", async () => {
    runs.claimDispatch.resolves(false);
    await service.startNow("r1");
    runs.findById.resolves(assigned());
    await service.startNow("r1");
    executor.canDispatch = false;
    runs.findById.resolves(run());
    runs.claimDispatch.resolves(true);
    await service.startNow("r1");

    expect(executor.dispatch.called).to.be.false;
  });

  it("агент подключился: ждущие задачи внешних очередей передаются", async () => {
    runs.findQueuedExternalIds.resolves(["r1"]);
    await service.startQueued();

    expect(runs.findQueuedExternalIds.firstCall.args[0]).to.deep.equal([
      "demo.echo",
    ]);
    expect(executor.dispatch.calledOnce).to.be.true;
  });

  it("ход задачи: прогресс и текст; событие раньше ответа на запуск связывает запись", async () => {
    runs.findById.resolves(run());
    await service.apply(
      update({ jobId: "r1", progress: 0.5, text: "шаг 1 из 2" }),
    );

    expect(tracker.updateIfActive.firstCall.args[1]).to.deep.include({
      status: EJobRunStatus.RUNNING,
      progress: 0.5,
      progressText: "шаг 1 из 2",
      agentId: "a1",
      worker: "echo",
      externalId: "w1",
    });
  });

  it("итог: onComplete с данными задачи из pg-boss; провал — onFail", async () => {
    runs.findByAssignment.resolves(assigned());
    await service.apply(update({ kind: "done", result: { text: "HI" } }));

    expect(tracker.updateIfActive.firstCall.args[1]).to.deep.include({
      status: EJobRunStatus.COMPLETED,
      result: { text: "HI" },
    });
    expect(handler.onComplete.firstCall.args[0].data).to.deep.equal({
      text: "hi",
    });

    runs.findByAssignment.resolves(assigned());
    await service.apply(
      update({ kind: "failed", error: { code: "BOOM", message: "упал" } }),
    );
    expect(tracker.updateIfActive.lastCall.args[1]).to.deep.include({
      status: EJobRunStatus.FAILED,
      error: { code: "BOOM", message: "упал" },
    });
    expect(handler.onFail.calledOnce).to.be.true;
  });

  it("событие чужой задачи (передали другому агенту) — пропускается", async () => {
    runs.findById.resolves(assigned({ agentId: "a2" }));
    await service.apply(update({ jobId: "r1", kind: "done" }));

    expect(tracker.updateIfActive.called).to.be.false;
  });

  it("сверка после подключения: воркер не знает задачу — EXTERNAL_JOB_LOST; знает — её состояние", async () => {
    runs.findActiveExternalByAgent.resolves([assigned()]);
    await service.reconcile("a1");

    expect(executor.poll.calledOnce).to.be.true;
    expect(tracker.updateIfActive.firstCall.args[1].error.code).to.equal(
      "EXTERNAL_JOB_LOST",
    );

    executor.poll.resolves(update({ kind: "done", result: 1 }));
    runs.findById.resolves(assigned());
    await service.reconcile("a1");
    expect(tracker.updateIfActive.lastCall.args[1]).to.deep.include({
      status: EJobRunStatus.COMPLETED,
    });
  });

  it("истёк срок — JOB_TIMEOUT и отмена у воркера", async () => {
    runs.findExpiredExternal.resolves([assigned()]);
    expect(await service.failExpired()).to.equal(1);

    expect(tracker.updateIfActive.firstCall.args[1].error.code).to.equal(
      "JOB_TIMEOUT",
    );
    expect(executor.cancel.calledOnce).to.be.true;
  });
});
