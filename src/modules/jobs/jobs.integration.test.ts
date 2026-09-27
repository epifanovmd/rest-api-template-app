import "reflect-metadata";

import { expect } from "chai";
import { Client } from "pg";
import type { ConstructorOptions } from "pg-boss";
import { PgBoss } from "pg-boss";
import { setTimeout as sleep } from "timers/promises";
import { DataSource } from "typeorm";

import {
  EventBus,
  ExternalJobContext,
  ExternalJobEvent,
  ExternalJobInfo,
  IExternalJobHandler,
  IJobHandler,
  JobContext,
  JobError,
} from "../../core";
import { JobRunner } from "./job.runner";
import { JobCancelWatcher } from "./job-cancel.watcher";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobLeaseReaper } from "./job-lease.reaper";
import { JobResultWaiter } from "./job-result.waiter";
import { JobRun } from "./job-run.entity";
import { JobRunRepository } from "./job-run.repository";
import { JobRunTracker } from "./job-run.tracker";
import { JobSignals } from "./job-signals";
import { JobWorker } from "./job-worker.entity";
import { JobWorkerTracker } from "./job-worker.tracker";
import { JobsBootstrap } from "./jobs.bootstrap";
import { EJobRunStatus, PGBOSS_SCHEMA } from "./jobs.types";
import { JobsWorkerService } from "./jobs-worker.service";
import { PgBossService } from "./pg-boss.service";
import { PgBossJobQueue } from "./pg-boss-job.queue";

/**
 * Интеграция с настоящим Postgres: `TEST_DATABASE_URL=postgres://…`.
 * Без переменной набор пропускается. БД — одноразовая: схема pgboss и
 * таблица job_runs пересоздаются.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL;

const waitFor = async <T>(
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = 15_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await probe();

    if (value) return value;
    await sleep(100);
  }

  return expect.fail(`условие не выполнилось за ${timeoutMs} мс`);
};

class TestPgBossService extends PgBossService {
  protected createBoss(options: ConstructorOptions): PgBoss {
    const { host, port, database, user, password, ssl, ...rest } = options;

    void [host, port, database, user, password, ssl];

    return new PgBoss({ ...rest, connectionString: DATABASE_URL });
  }
}

class TestSignals extends JobSignals {
  protected createClient(): Client {
    return new Client({ connectionString: DATABASE_URL });
  }
}

const flakyAttempts: number[] = [];
const completedExternal: { id: string; result: unknown; inTx: boolean }[] = [];
const externalEvents: { id: string; type: string; data: unknown }[] = [];

const handlers: (IJobHandler<any, any> | IExternalJobHandler<any, any>)[] = [
  {
    definition: { queue: "it.echo", tracked: true },
    handle: async (ctx: JobContext<{ text: string }>) => {
      await ctx.progress(0.5, "половина");
      await ctx.log("эхо");

      return { echo: ctx.data.text };
    },
  },
  {
    definition: {
      queue: "it.flaky",
      tracked: true,
      retryLimit: 2,
      retryDelaySeconds: 1,
      retryBackoff: false,
    },
    handle: async (ctx: JobContext) => {
      flakyAttempts.push(ctx.attempt);
      if (ctx.attempt === 0) throw new Error("временный сбой");

      return { ok: true };
    },
  },
  {
    definition: { queue: "it.fatal", tracked: true, retryLimit: 3 },
    handle: async () => {
      throw new JobError("BAD_INPUT", "плохие данные", false);
    },
  },
  {
    definition: { queue: "it.slow", tracked: true },
    handle: (ctx: JobContext) =>
      new Promise((_, reject) => {
        ctx.signal.addEventListener("abort", () =>
          reject(new Error("прервано")),
        );
      }),
  },
  {
    definition: { queue: "it.plain" },
    handle: async () => undefined,
  },
  {
    definition: {
      queue: "it.external",
      external: true,
      leaseSeconds: 30,
      retryLimit: 1,
      retryDelaySeconds: 1,
      retryBackoff: false,
    },
    onComplete: async (ctx: ExternalJobContext, result: unknown) => {
      completedExternal.push({
        id: ctx.id,
        result,
        inTx: ctx.manager.queryRunner?.isTransactionActive === true,
      });
    },
    onEvent: async (job: ExternalJobInfo, event: ExternalJobEvent) => {
      externalEvents.push({ id: job.id, type: event.type, data: event.data });
    },
  },
];

describe("JobQueue на pg-boss (интеграция, TEST_DATABASE_URL)", function () {
  this.timeout(60_000);

  let dataSource: DataSource;
  let boss: TestPgBossService;
  let tracker: JobRunTracker;
  let queue: PgBossJobQueue;
  let bootstrap: JobsBootstrap;
  let worker: JobsWorkerService;
  let reaper: JobLeaseReaper;
  let runs: JobRunRepository;
  let signals: TestSignals;

  const bossState = async (id: string) => (await boss.findJob(id))?.state;

  before(async function () {
    if (!DATABASE_URL) this.skip();

    dataSource = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      entities: [JobRun, JobWorker],
    });
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS ${PGBOSS_SCHEMA} CASCADE`);
    await dataSource.query("DROP TABLE IF EXISTS job_runs");
    await dataSource.query("DROP TABLE IF EXISTS job_workers");
    await dataSource.synchronize();
    await dataSource.query(
      "CREATE TABLE IF NOT EXISTS it_outbox (id serial PRIMARY KEY, note text)",
    );

    const eventBus = new EventBus();

    runs = new JobRunRepository(dataSource, JobRun);
    signals = new TestSignals(dataSource);
    tracker = new JobRunTracker(runs, eventBus, signals);
    boss = new TestPgBossService();

    const registry = new JobHandlerRegistry();
    const watcher = new JobCancelWatcher(signals, runs, boss);

    reaper = new JobLeaseReaper(runs, tracker, boss);
    queue = new PgBossJobQueue(
      boss,
      registry,
      tracker,
      watcher,
      signals,
      new JobResultWaiter(signals, runs),
      dataSource,
    );
    bootstrap = new JobsBootstrap(
      boss,
      registry,
      new JobRunner(tracker, watcher),
      watcher,
      signals,
      reaper,
      handlers,
    );
    worker = new JobsWorkerService(
      boss,
      registry,
      tracker,
      dataSource,
      signals,
      new JobWorkerTracker(dataSource),
    );

    await bootstrap.initialize();
    expect(watcher.isListening).to.be.true;
  });

  after(async () => {
    await bootstrap?.destroy();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it("enqueue → work → complete: запись, прогресс, результат", async () => {
    const id = (await queue.enqueue(
      "it.echo",
      { text: "привет" },
      { title: "Эхо", ownerId: "00000000-0000-0000-0000-000000000001" },
    )) as string;

    const run = await waitFor(async () => {
      const found = await runs.findById(id);

      return found?.status === EJobRunStatus.COMPLETED && found;
    });

    expect(run.result).to.deep.equal({ echo: "привет" });
    expect(run.progress).to.equal(1);
    expect(run.title).to.equal("Эхо");
    expect(run.logTail[0]).to.match(/эхо$/);
    expect(run.startedAt).to.be.instanceOf(Date);
    expect(await bossState(id)).to.equal("completed");
  });

  it("повтор после ошибки: вторая попытка успешна", async () => {
    const id = (await queue.enqueue("it.flaky", {})) as string;

    const run = await waitFor(async () => {
      const found = await runs.findById(id);

      return found?.status === EJobRunStatus.COMPLETED && found;
    });

    expect(flakyAttempts).to.deep.equal([0, 1]);
    expect(run.attempt).to.equal(1);
  });

  it("JobError retryable=false — без повторов, failed", async () => {
    const id = (await queue.enqueue("it.fatal", {})) as string;

    const run = await waitFor(async () => {
      const found = await runs.findById(id);

      return found?.status === EJobRunStatus.FAILED && found;
    });

    expect(run.error).to.deep.equal({
      code: "BAD_INPUT",
      message: "плохие данные",
    });
    expect(run.attempt).to.equal(0);
    await waitFor(async () => (await bossState(id)) === "failed");
  });

  it("отмена выполняющейся задачи через NOTIFY: сигнал, cancelled", async () => {
    const id = (await queue.enqueue("it.slow", {})) as string;

    await waitFor(
      async () => (await runs.findById(id))?.status === EJobRunStatus.RUNNING,
    );
    await queue.cancel(id);

    const run = await waitFor(async () => {
      const found = await runs.findById(id);

      return found?.status === EJobRunStatus.CANCELLED && found;
    });

    expect(run.cancelRequested).to.be.true;
    expect(await bossState(id)).to.equal("cancelled");
  });

  it("отмена ждущей задачи — сразу cancelled", async () => {
    const id = (await queue.enqueue(
      "it.slow",
      {},
      { startAfter: 3600 },
    )) as string;

    await queue.cancel(id);

    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.CANCELLED);
    expect(await bossState(id)).to.equal("cancelled");
  });

  it("outbox: откат транзакции отменяет и задачу, и запись", async () => {
    let jobId: string | null = null;

    try {
      await dataSource.transaction(async manager => {
        await manager.query("INSERT INTO it_outbox (note) VALUES ('rollback')");
        jobId = await queue.enqueue("it.echo", { text: "x" }, { manager });
        throw new Error("откат");
      });
    } catch {
      // ожидаемо
    }

    expect(jobId).to.be.a("string");
    expect(await boss.findJob(jobId as unknown as string)).to.be.null;
    expect(await runs.findById(jobId as unknown as string)).to.be.null;

    const [{ count }] = await dataSource.query(
      "SELECT count(*)::int AS count FROM it_outbox WHERE note = 'rollback'",
    );

    expect(count).to.equal(0);
  });

  it("outbox: коммит — задача и запись появляются вместе", async () => {
    const id = await dataSource.transaction(async manager => {
      await manager.query("INSERT INTO it_outbox (note) VALUES ('commit')");

      return queue.enqueue("it.plain", {}, { manager, track: true });
    });

    await waitFor(
      async () =>
        (await runs.findById(id as string))?.status === EJobRunStatus.COMPLETED,
    );
  });

  it("внешняя очередь: claim → heartbeat → complete с onComplete в транзакции", async () => {
    const caller = { scopes: ["worker:it.external"] };
    const id = (await queue.enqueue("it.external", { n: 1 })) as string;
    const [job] = await worker.claim(caller, {
      queues: ["it.external"],
      waitSeconds: 5,
    });

    expect(job).to.include({ jobId: id, queue: "it.external", attempt: 0 });
    expect(job.data).to.deep.equal({ n: 1 });

    expect(
      await worker.heartbeat(caller, id, {
        attempt: 0,
        progress: 0.3,
        log: ["шаг"],
      }),
    ).to.deep.equal({ cancel: false, stop: false });
    expect((await runs.findById(id))?.progress).to.be.closeTo(0.3, 0.001);

    await worker.complete(caller, id, { attempt: 0, result: { sum: 2 } });

    expect(completedExternal).to.deep.include({
      id,
      result: { sum: 2 },
      inTx: true,
    });
    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.COMPLETED);
    expect(await bossState(id)).to.equal("completed");
  });

  it("внешняя очередь: истёкшая аренда — reaper возвращает задачу в очередь", async () => {
    const caller = { scopes: ["worker:*"] };
    const id = (await queue.enqueue("it.external", { n: 2 })) as string;

    await worker.claim(caller, { queues: ["it.external"], waitSeconds: 5 });
    await runs.update({ id }, { leaseUntil: new Date(Date.now() - 1000) });

    expect(await reaper.reap()).to.equal(1);

    const run = await runs.findById(id);

    expect(run?.status).to.equal(EJobRunStatus.QUEUED);
    expect(run?.error?.code).to.equal("LEASE_EXPIRED");
    expect(await bossState(id)).to.equal("retry");

    // Старый воркер узнаёт о потере аренды.
    expect(await worker.heartbeat(caller, id, { attempt: 0 })).to.deep.equal({
      cancel: true,
      stop: false,
    });

    const [again] = await waitFor(() =>
      worker
        .claim(caller, { queues: ["it.external"], waitSeconds: 2 })
        .then(jobs => jobs.length > 0 && jobs),
    );

    expect(again).to.include({ jobId: id, attempt: 1 });

    await worker.fail(caller, id, {
      attempt: 1,
      code: "BROKEN",
      message: "сломалось",
      retryable: false,
    });
    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.FAILED);
    expect(await bossState(id)).to.equal("failed");
  });
  it("request: воркер берёт задачу по сигналу сразу, результат доходит до ждущего", async () => {
    const caller = { scopes: ["worker:it.external"] };
    const startedAt = Date.now();
    const pending = queue.request<{ n: number }, { doubled: number }>(
      "it.external",
      { n: 21 },
      { timeoutMs: 10_000 },
    );
    const [job] = await worker.claim(caller, {
      queues: ["it.external"],
      waitSeconds: 10,
    });

    // Без сигнала job_available claim ждал бы следующего опроса (1 с).
    expect(Date.now() - startedAt).to.be.below(900);

    await worker.heartbeat(caller, job.jobId, {
      attempt: job.attempt,
      events: [{ type: "epoch", data: { epoch: 1 } }],
    });
    await worker.complete(caller, job.jobId, {
      attempt: job.attempt,
      result: { doubled: 42 },
    });

    expect(await pending).to.deep.equal({ doubled: 42 });
    expect(externalEvents).to.deep.include({
      id: job.jobId,
      type: "epoch",
      data: { epoch: 1 },
    });
  });

  it("request: ошибка воркера — 502 с его кодом; таймаут — 504 и задача снята", async () => {
    const caller = { scopes: ["worker:it.external"] };
    const failing = queue.request(
      "it.external",
      { n: 0 },
      { timeoutMs: 10_000 },
    );
    const [job] = await worker.claim(caller, {
      queues: ["it.external"],
      waitSeconds: 10,
    });

    await worker.fail(caller, job.jobId, {
      attempt: job.attempt,
      code: "BAD_MODEL",
      message: "веса повреждены",
      retryable: false,
    });

    try {
      await failing;
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err.status).to.equal(502);
      expect(err.reason).to.include({ code: "BAD_MODEL" });
    }

    try {
      await queue.request("it.external", { n: 1 }, { timeoutMs: 300 });
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err.status).to.equal(504);
    }

    // Снятая по таймауту задача воркеру больше не выдаётся.
    const left = await worker.claim(caller, {
      queues: ["it.external"],
      max: 10,
      waitSeconds: 1,
    });

    expect(left.map(j => j.data)).to.not.deep.include({ n: 1 });
  });

  it("stop: heartbeat сообщает stop, complete принимается", async () => {
    const caller = { scopes: ["worker:it.external"] };
    const id = (await queue.enqueue("it.external", { n: 3 })) as string;
    const [job] = await worker.claim(caller, {
      queues: ["it.external"],
      waitSeconds: 5,
    });

    await queue.stop(id);

    expect(
      await worker.heartbeat(caller, id, { attempt: job.attempt }),
    ).to.deep.equal({ cancel: false, stop: true });

    await worker.complete(caller, id, {
      attempt: job.attempt,
      result: { partial: true },
    });

    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.COMPLETED);
  });

  it("статус воркеров: claim отмечает воркера, он на связи по своей очереди", async () => {
    await worker.claim(
      { scopes: ["worker:it.external"], keyId: "apikey:it" },
      {
        queues: ["it.external"],
        waitSeconds: 0,
        worker: { name: "it-host:1", meta: { device: "cpu" } },
      },
    );

    const [status] = await worker.workersStatus();

    expect(status.queue).to.equal("it.external");
    expect(status.online).to.be.true;
    expect(status.workers.map(w => w.name)).to.include("it-host:1");
  });
});
