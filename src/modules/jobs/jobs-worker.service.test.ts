import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { HttpException } from "../../core";
import { createMockFileStorage } from "../../test/helpers";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobSignals } from "./job-signals";
import { JobsError } from "./jobs.errors";
import { EJobRunStatus } from "./jobs.types";
import { JobsWorkerService } from "./jobs-worker.service";

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail("должно было упасть");
  } catch (err) {
    expect(err).to.be.instanceOf(HttpException);
    expect((err as HttpException).code).to.equal(code);
  }
};

const bossJob = (id = "job-1", queue = "demo.echo") =>
  ({ id, name: queue, data: { text: "hi" }, retryCount: 1 }) as any;

const createRun = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  queue: "demo.echo",
  status: EJobRunStatus.RUNNING,
  attempt: 1,
  cancelRequested: false,
  stopRequested: false,
  eventSeq: 0,
  logTail: [] as string[],
  files: null as unknown,
  ...overrides,
});

describe("JobsWorkerService", () => {
  const caller = { scopes: ["worker:demo.echo"] };
  let external: {
    definition: Record<string, unknown>;
    io: sinon.SinonStub;
    onComplete: sinon.SinonStub;
    onFail: sinon.SinonStub;
    onEvent: sinon.SinonStub;
  };
  let boss: Record<string, sinon.SinonStub>;
  let bossService: Record<string, sinon.SinonStub>;
  let tracker: Record<string, sinon.SinonStub>;
  let manager: { queryRunner: { query: sinon.SinonStub } };
  let dataSource: { transaction: sinon.SinonStub };
  let storage: ReturnType<typeof createMockFileStorage>;
  let signals: JobSignals;
  let workers: { seen: sinon.SinonStub; status: sinon.SinonStub };
  let service: JobsWorkerService;

  beforeEach(() => {
    external = {
      definition: { queue: "demo.echo", external: true, leaseSeconds: 30 },
      io: sinon.stub().returns({}),
      onComplete: sinon.stub().resolves(),
      onFail: sinon.stub().resolves(),
      onEvent: sinon.stub().resolves(),
    };

    const internal = {
      definition: { queue: "mail.send" },
      handle: sinon.stub(),
    };
    const registry = new JobHandlerRegistry();

    registry.register([external as any, internal as any]);

    boss = {
      fetch: sinon.stub().resolves([]),
      complete: sinon.stub().resolves({ affected: 1 }),
      fail: sinon.stub().resolves({ affected: 1 }),
      cancel: sinon.stub().resolves({ affected: 1 }),
      findJobs: sinon.stub().resolves([{ data: { text: "hi" } }]),
    };
    bossService = {
      ready: sinon.stub().resolves(boss),
      findJob: sinon.stub().resolves({ queue: "demo.echo", state: "retry" }),
      failFinal: sinon.stub().resolves(),
    };
    tracker = {
      start: sinon.stub().callsFake(async p => createRun({ files: p.files })),
      find: sinon.stub().resolves(createRun()),
      update: sinon.stub().resolves(),
      complete: sinon.stub().resolves(),
      fail: sinon.stub().resolves(),
      publish: sinon.stub(),
    };
    manager = {
      queryRunner: { query: sinon.stub().resolves({ records: [] }) },
    };
    dataSource = {
      transaction: sinon.stub().callsFake(async (cb: any) => cb(manager)),
    };
    storage = createMockFileStorage();
    signals = new JobSignals({} as any);
    workers = {
      seen: sinon.stub().resolves(),
      status: sinon.stub().resolves([]),
    };
    service = new JobsWorkerService(
      bossService as any,
      registry,
      tracker as any,
      dataSource as any,
      signals,
      workers as any,
      storage as any,
    );
  });

  describe("claim", () => {
    it("выдаёт задачу с арендой, попыткой и подписанными ссылками", async () => {
      boss.fetch.resolves([bossJob()]);
      external.io.returns({
        inputs: { source: "uploads/a.txt" },
        outputs: {
          echo: { key: "jobs/job-1/echo.txt", contentType: "text/plain" },
        },
      });

      const [job] = await service.claim(caller, { queues: ["demo.echo"] });

      expect(job).to.deep.equal({
        jobId: "job-1",
        queue: "demo.echo",
        data: { text: "hi" },
        attempt: 1,
        leaseSeconds: 30,
        inputs: { source: "https://files.test/uploads/a.txt?sig=x" },
        outputs: { echo: "https://files.test/jobs/job-1/echo.txt?put=x" },
        outputContentTypes: { echo: "text/plain" },
      });
      expect(boss.fetch.firstCall.args[1]).to.deep.equal({
        batchSize: 1,
        includeMetadata: true,
      });
      expect(tracker.start.firstCall.args[0]).to.deep.include({
        id: "job-1",
        attempt: 1,
        leaseSeconds: 30,
        createIfMissing: true,
      });
      expect(storage.signedPutUrl.firstCall.args[1]).to.deep.equal({
        contentType: "text/plain",
      });
    });

    it("очередь не из scope ключа — 403", async () => {
      await expectCode(
        service.claim({ scopes: ["worker:other"] }, { queues: ["demo.echo"] }),
        JobsError.codes.QUEUE_FORBIDDEN,
      );
    });

    it("worker:* разрешает любую внешнюю очередь", async () => {
      expect(
        await service.claim(
          { scopes: ["worker:*"] },
          { queues: ["demo.echo"] },
        ),
      ).to.deep.equal([]);
    });

    it("Node-очередь — 400 JOB_NOT_EXTERNAL, неизвестная — JOB_UNKNOWN_QUEUE", async () => {
      await expectCode(
        service.claim({ scopes: ["*"] }, { queues: ["mail.send"] }),
        JobsError.codes.NOT_EXTERNAL,
      );
      await expectCode(
        service.claim({ scopes: ["*"] }, { queues: ["nope"] }),
        JobsError.codes.UNKNOWN_QUEUE,
      );
    });

    it("long-poll: ждёт, пока задача не появится", async () => {
      boss.fetch.onFirstCall().resolves([]);
      boss.fetch.onSecondCall().resolves([bossJob()]);

      const started = Date.now();
      const jobs = await service.claim(caller, {
        queues: ["demo.echo"],
        waitSeconds: 5,
      });

      expect(jobs).to.have.length(1);
      expect(boss.fetch.callCount).to.equal(2);
      expect(Date.now() - started).to.be.at.least(900);
    });

    it("long-poll прерывается обрывом соединения", async () => {
      const controller = new AbortController();

      setTimeout(() => controller.abort(), 50);

      const jobs = await service.claim(
        caller,
        { queues: ["demo.echo"], waitSeconds: 25 },
        controller.signal,
      );

      expect(jobs).to.deep.equal([]);
    });

    it("long-poll просыпается по сигналу о новой задаче своей очереди", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: false });

      try {
        boss.fetch
          .onFirstCall()
          .resolves([])
          .onSecondCall()
          .resolves([bossJob()]);

        const pending = service.claim(caller, {
          queues: ["demo.echo"],
          waitSeconds: 20,
        });

        await clock.tickAsync(10);
        (signals as any).dispatch("job_available", "other.queue");
        await clock.tickAsync(10);
        expect(boss.fetch.callCount).to.equal(1);

        (signals as any).dispatch("job_available", "demo.echo");
        await clock.tickAsync(10);

        const jobs = await pending;

        expect(jobs).to.have.length(1);
        expect(boss.fetch.callCount).to.equal(2);
      } finally {
        clock.restore();
      }
    });

    it("claim отмечает воркера по его очередям; статус — только внешние очереди", async () => {
      await service.claim(
        { scopes: ["worker:demo.echo"], keyId: "apikey:k1" },
        {
          queues: ["demo.echo"],
          worker: { name: "gpu-1:42", meta: { device: "cuda:0" } },
        },
      );

      expect(workers.seen.firstCall.args).to.deep.equal([
        ["demo.echo"],
        { name: "gpu-1:42", meta: { device: "cuda:0" } },
        "apikey:k1",
      ]);

      await service.workersStatus();
      expect(workers.status.firstCall.args[0]).to.deep.equal(["demo.echo"]);
    });

    it("файлы без хранилища — задача проваливается, воркер её не получает", async () => {
      const registry = new JobHandlerRegistry();

      registry.register([external as any]);
      service = new JobsWorkerService(
        bossService as any,
        registry,
        tracker as any,
        dataSource as any,
        signals,
        workers as any,
      );
      boss.fetch.resolves([bossJob()]);
      external.io.returns({ inputs: { source: "a" } });

      expect(
        await service.claim(caller, { queues: ["demo.echo"] }),
      ).to.deep.equal([]);
      expect(boss.fail.firstCall.args[2]).to.include({ code: "CLAIM_FAILED" });
    });
  });

  describe("heartbeat", () => {
    it("продлевает аренду и пишет прогресс", async () => {
      const result = await service.heartbeat(caller, "job-1", {
        attempt: 1,
        progress: 0.4,
        text: "кадр 4",
        log: ["a"],
      });

      expect(result).to.deep.equal({ cancel: false, stop: false });

      const patch = tracker.update.firstCall.args[1];

      expect(patch).to.include({ progress: 0.4, progressText: "кадр 4" });
      expect(patch.leaseUntil.getTime()).to.be.closeTo(
        Date.now() + 30_000,
        1000,
      );
      expect(patch.logTail).to.have.length(1);
    });

    it("отменённая задача — cancel: true", async () => {
      tracker.find.resolves(createRun({ cancelRequested: true }));
      expect(await service.heartbeat(caller, "job-1", {})).to.deep.equal({
        cancel: true,
        stop: false,
      });
      expect(tracker.update.called).to.be.false;
    });

    it("другая попытка (аренда ушла другому) — cancel: true", async () => {
      expect(
        await service.heartbeat(caller, "job-1", { attempt: 0 }),
      ).to.deep.equal({ cancel: true, stop: false });
    });

    it("запрошена штатная остановка — stop: true, задача продолжается", async () => {
      tracker.find.resolves(createRun({ stopRequested: true }));
      expect(await service.heartbeat(caller, "job-1", {})).to.deep.equal({
        cancel: false,
        stop: true,
      });
    });

    it("события — хуку onEvent по порядку; падение хука не ломает heartbeat", async () => {
      external.onEvent.onFirstCall().rejects(new Error("boom"));

      const result = await service.heartbeat(caller, "job-1", {
        events: [
          { type: "epoch", data: { epoch: 1 } },
          { type: "epoch", data: { epoch: 2 } },
        ],
      });

      expect(result.cancel).to.be.false;
      expect(external.onEvent.callCount).to.equal(2);

      const [info, event] = external.onEvent.secondCall.args;

      expect(info).to.include({ id: "job-1", queue: "demo.echo" });
      expect(info.data).to.deep.equal({ text: "hi" });
      expect(event).to.deep.equal({ type: "epoch", data: { epoch: 2 } });
    });

    it("повтор событий (ответ heartbeat потерялся) — хуку только новые, номер сохраняется", async () => {
      tracker.find.resolves(createRun({ eventSeq: 2 }));

      await service.heartbeat(caller, "job-1", {
        attempt: 1,
        events: [
          { seq: 2, type: "epoch", data: { epoch: 2 } },
          { seq: 3, type: "epoch", data: { epoch: 3 } },
          { seq: 4, type: "epoch", data: { epoch: 4 } },
        ],
      });

      expect(
        external.onEvent.getCalls().map(call => call.args[1]),
      ).to.deep.equal([
        { type: "epoch", data: { epoch: 3 } },
        { type: "epoch", data: { epoch: 4 } },
      ]);
      expect(
        tracker.update.getCalls().some(call => call.args[1].eventSeq === 4),
      ).to.be.true;
    });

    it("все события уже приняты — хук не вызывается", async () => {
      tracker.find.resolves(createRun({ eventSeq: 5 }));

      await service.heartbeat(caller, "job-1", {
        events: [{ seq: 5, type: "epoch", data: { epoch: 5 } }],
      });

      expect(external.onEvent.called).to.be.false;
    });

    it("чужая очередь по scope — 403", async () => {
      await expectCode(
        service.heartbeat({ scopes: ["worker:x"] }, "job-1", {}),
        JobsError.codes.QUEUE_FORBIDDEN,
      );
    });
  });

  describe("complete", () => {
    it("onComplete и завершение pg-boss — в одной транзакции", async () => {
      tracker.find.resolves(
        createRun({ files: { inputs: {}, outputs: { echo: { key: "k1" } } } }),
      );

      await service.complete(caller, "job-1", {
        attempt: 1,
        result: { echo: "hi" },
      });

      const [ctx, result] = external.onComplete.firstCall.args;

      expect(ctx).to.include({ id: "job-1", queue: "demo.echo", attempt: 1 });
      expect(ctx.manager).to.equal(manager);
      expect(ctx.outputs).to.deep.equal({ echo: "k1" });
      expect(ctx.data).to.deep.equal({ text: "hi" });
      expect(result).to.deep.equal({ echo: "hi" });
      expect(boss.complete.firstCall.args.slice(0, 3)).to.deep.equal([
        "demo.echo",
        "job-1",
        { echo: "hi" },
      ]);
      expect(boss.complete.firstCall.args[3].db).to.exist;
      expect(tracker.complete.firstCall.args[2]).to.equal(manager);
      expect(tracker.publish.calledOnce).to.be.true;
    });

    it("задача уже не активна в pg-boss — 409, транзакция откатывается", async () => {
      boss.complete.resolves({ affected: 0 });

      await expectCode(
        service.complete(caller, "job-1", { result: 1 }),
        JobsError.codes.LEASE_LOST,
      );
      expect(tracker.publish.called).to.be.false;
    });

    it("отменённая — 409", async () => {
      tracker.find.resolves(createRun({ status: EJobRunStatus.CANCELLED }));
      await expectCode(
        service.complete(caller, "job-1", {}),
        JobsError.codes.LEASE_LOST,
      );
    });

    it("onComplete упал — попытка проваливается с повтором", async () => {
      external.onComplete.rejects(new Error("domain"));

      try {
        await service.complete(caller, "job-1", {});
        expect.fail("должно было упасть");
      } catch (err) {
        expect((err as Error).message).to.equal("domain");
      }

      expect(boss.fail.firstCall.args[2]).to.include({
        code: "COMPLETE_HOOK_FAILED",
      });
      expect(tracker.fail.firstCall.args[2]).to.equal(false);
    });
  });

  describe("fail", () => {
    it("с повтором — pg-boss fail, запись снова в очереди", async () => {
      await service.fail(caller, "job-1", {
        code: "OOM",
        message: "памяти нет",
      });

      expect(
        boss.fail.calledWith("demo.echo", "job-1", {
          code: "OOM",
          message: "памяти нет",
        }),
      ).to.be.true;
      expect(tracker.fail.firstCall.args[2]).to.equal(false);
      expect(external.onFail.firstCall.args[1]).to.include({
        retryable: true,
        final: false,
      });
    });

    it("retryable: false — без повторов, запись failed", async () => {
      bossService.findJob.resolves({ queue: "demo.echo", state: "failed" });

      await service.fail(caller, "job-1", {
        code: "BAD_INPUT",
        message: "плохо",
        retryable: false,
      });

      expect(bossService.failFinal.calledOnce).to.be.true;
      expect(boss.fail.called).to.be.false;
      expect(tracker.fail.firstCall.args[2]).to.equal(true);
    });
  });
});
