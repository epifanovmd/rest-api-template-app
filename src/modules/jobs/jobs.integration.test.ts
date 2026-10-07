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
import { ExternalJobService } from "./external-job.service";
import { JobRunner } from "./job.runner";
import { JobCancelWatcher } from "./job-cancel.watcher";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobLeaseReaper } from "./job-lease.reaper";
import { JobResultWaiter } from "./job-result.waiter";
import { JobRun } from "./job-run.entity";
import { JobRunRepository } from "./job-run.repository";
import { JobRunTracker } from "./job-run.tracker";
import { JobSignals } from "./job-signals";
import { JobsBootstrap } from "./jobs.bootstrap";
import { EJobRunStatus, PGBOSS_SCHEMA } from "./jobs.types";
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
  let external: ExternalJobService;
  let reaper: JobLeaseReaper;
  let runs: JobRunRepository;
  let signals: TestSignals;

  const bossState = async (id: string) => (await boss.findJob(id))?.state;

  before(async function () {
    if (!DATABASE_URL) this.skip();

    dataSource = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      entities: [JobRun],
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
    external = new ExternalJobService(
      boss,
      registry,
      tracker,
      runs,
      dataSource,
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

  const AGENT = "11111111-1111-4111-8111-111111111111";
  const OTHER_AGENT = "22222222-2222-4222-8222-222222222222";

  /** Раздать агенту задачи внешней очереди, как это делает возможность `jobs`. */
  const take = (max = 1, agentId = AGENT) =>
    external.take("it.external", max, agentId);

  it("внешняя очередь: выдача агенту → прогресс → complete с onComplete в транзакции", async () => {
    const id = (await queue.enqueue("it.external", { n: 1 })) as string;
    const [job] = await take();

    expect(job).to.include({ jobId: id, queue: "it.external", attempt: 0 });
    expect(job.data).to.deep.equal({ n: 1 });
    expect((await runs.findById(id))?.agentId).to.equal(AGENT);

    await external.progress(AGENT, {
      jobId: id,
      attempt: 0,
      progress: 0.3,
      log: ["шаг"],
    });
    await waitFor(
      async () => (await runs.findById(id))?.progress === 0.3 || null,
    );

    await external.complete(AGENT, { jobId: id, attempt: 0 }, { sum: 2 });

    expect(completedExternal).to.deep.include({
      id,
      result: { sum: 2 },
      inTx: true,
    });
    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.COMPLETED);
    expect(await bossState(id)).to.equal("completed");
  });

  it("чужой агент и устаревшая попытка не могут сдать задачу (LEASE_LOST)", async () => {
    const id = (await queue.enqueue("it.external", { n: 5 })) as string;

    await take();

    for (const [agentId, attempt] of [
      [OTHER_AGENT, 0],
      [AGENT, 7],
    ] as const) {
      try {
        await external.complete(agentId, { jobId: id, attempt }, {});
        expect.fail("должно было упасть");
      } catch (err: any) {
        expect(err.code).to.equal("JOB_LEASE_LOST");
      }
    }

    await external.complete(AGENT, { jobId: id, attempt: 0 }, {});
  });

  it("пульс агента продлевает аренду только его задач", async () => {
    const id = (await queue.enqueue("it.external", { n: 6 })) as string;

    await take();
    await runs.update({ id }, { leaseUntil: new Date(Date.now() + 1000) });
    await external.extendLeases(OTHER_AGENT, [{ jobId: id, attempt: 0 }]);
    expect((await runs.findById(id))!.leaseUntil!.getTime()).to.be.below(
      Date.now() + 5_000,
    );

    await external.extendLeases(AGENT, [{ jobId: id, attempt: 0 }]);
    expect((await runs.findById(id))!.leaseUntil!.getTime()).to.be.above(
      Date.now() + 20_000,
    );

    await external.complete(AGENT, { jobId: id, attempt: 0 }, {});
  });

  it("сверка при hello: не принятую — выдать снова, принятую и потерянную — провалить, лишнюю — отменить", async () => {
    const lostId = (await queue.enqueue("it.external", { n: 7 })) as string;
    const [lost] = await take();

    await external.accept(AGENT, lost);

    const resendId = (await queue.enqueue("it.external", { n: 8 })) as string;

    await take();

    const stray = { jobId: OTHER_AGENT, attempt: 0 };
    const result = await external.reconcile(AGENT, [stray]);

    expect(result.resend.map(a => a.jobId)).to.deep.equal([resendId]);
    expect(result.cancel).to.deep.equal([stray]);

    const lostRun = await runs.findById(lostId);

    expect(lostRun?.status).to.equal(EJobRunStatus.QUEUED);
    expect(lostRun?.error?.code).to.equal("AGENT_LOST");

    await external.complete(AGENT, { jobId: resendId, attempt: 0 }, {});
    await waitFor(() => take().then(jobs => jobs.length > 0 && jobs));
    await external.complete(AGENT, { jobId: lostId, attempt: 1 }, {});
  });

  it("отказ агента возвращает задачу в очередь без траты попытки", async () => {
    const id = (await queue.enqueue("it.external", { n: 9 })) as string;

    await take();
    await external.reject(
      AGENT,
      { jobId: id, attempt: 0 },
      { code: "QUEUE_BUSY", message: "нет места" },
    );

    expect(await bossState(id)).to.equal("created");

    const [again] = await take(1, OTHER_AGENT);

    expect(again).to.include({ jobId: id, attempt: 0 });
    await external.complete(OTHER_AGENT, again, {});
  });

  it("внешняя очередь: истёкшая аренда — reaper возвращает задачу в очередь", async () => {
    const id = (await queue.enqueue("it.external", { n: 2 })) as string;

    await take();
    await runs.update({ id }, { leaseUntil: new Date(Date.now() - 1000) });

    expect(await reaper.reap()).to.equal(1);

    const run = await runs.findById(id);

    expect(run?.status).to.equal(EJobRunStatus.QUEUED);
    expect(run?.error?.code).to.equal("LEASE_EXPIRED");
    expect(await bossState(id)).to.equal("retry");

    const [again] = await waitFor(() =>
      take().then(jobs => jobs.length > 0 && jobs),
    );

    expect(again).to.include({ jobId: id, attempt: 1 });

    // Итог старой попытки не принимается.
    try {
      await external.complete(AGENT, { jobId: id, attempt: 0 }, {});
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err.code).to.equal("JOB_LEASE_LOST");
    }

    await external.fail(
      AGENT,
      { jobId: id, attempt: 1 },
      { code: "BROKEN", message: "сломалось", retryable: false },
    );
    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.FAILED);
    expect(await bossState(id)).to.equal("failed");
  });

  it("request: события и результат агента доходят до ждущего", async () => {
    const pending = queue.request<{ n: number }, { doubled: number }>(
      "it.external",
      { n: 21 },
      { timeoutMs: 10_000 },
    );
    const [job] = await waitFor(() =>
      take().then(jobs => jobs.length > 0 && jobs),
    );

    await external.event(AGENT, {
      jobId: job.jobId,
      attempt: job.attempt,
      seq: 1,
      type: "epoch",
      data: { epoch: 1 },
    });
    // Повтор того же события (ack потерялся) — мимо.
    await external.event(AGENT, {
      jobId: job.jobId,
      attempt: job.attempt,
      seq: 1,
      type: "epoch",
      data: { epoch: 1 },
    });
    await external.complete(AGENT, job, { doubled: 42 });

    expect(await pending).to.deep.equal({ doubled: 42 });
    expect(
      externalEvents.filter(e => e.id === job.jobId && e.type === "epoch"),
    ).to.have.length(1);
  });

  it("request: ошибка агента — 502 с его кодом; таймаут — 504 и задача снята", async () => {
    const failing = queue.request(
      "it.external",
      { n: 0 },
      { timeoutMs: 10_000 },
    );
    const [job] = await waitFor(() =>
      take().then(jobs => jobs.length > 0 && jobs),
    );

    await external.fail(AGENT, job, {
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

    // Снятая по таймауту задача агенту больше не выдаётся.
    const left = await take(10);

    expect(left.map(j => j.data)).to.not.deep.include({ n: 1 });
  });

  it("stop: сверка сообщает stop, complete принимается", async () => {
    const id = (await queue.enqueue("it.external", { n: 3 })) as string;
    const [job] = await take();

    await queue.stop(id);

    const { stop } = await external.reconcile(AGENT, [job]);

    expect(stop).to.deep.equal([{ jobId: id, attempt: job.attempt }]);

    await external.complete(AGENT, job, { partial: true });

    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.COMPLETED);
  });
});
