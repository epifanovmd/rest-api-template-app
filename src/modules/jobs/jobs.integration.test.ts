import "reflect-metadata";

import { expect } from "chai";
import { Client } from "pg";
import type { ConstructorOptions } from "pg-boss";
import { PgBoss } from "pg-boss";
import { setTimeout as sleep } from "timers/promises";
import { DataSource } from "typeorm";

import {
  EventBus,
  ExternalJobAssignment,
  ExternalJobContext,
  ExternalJobDispatch,
  ExternalJobFailure,
  ExternalJobInfo,
  ExternalJobUpdate,
  IExternalJobExecutor,
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
import { JobRunViews } from "./job-run.views";
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

const AGENT_ID = "0123456789abcdef0123456789abcdef";

/**
 * Исполнитель внешних очередей в памяти: задача «запускается» сразу —
 * быстрая (`data.quick`) отдаёт итог в ответе, ход и итог долгой тест
 * присылает сам (`emit`) — как события воркера через агента. `available =
 * false` — подходящего агента нет.
 */
class FakeExecutor implements IExternalJobExecutor {
  readonly canDispatch = true;
  readonly dispatched: ExternalJobDispatch[] = [];
  readonly cancelled: string[] = [];
  available = true;
  /** Что ответит опрос хода задачи; нет — воркер о задаче не знает. */
  private readonly _works = new Map<string, ExternalJobUpdate>();
  private readonly _listeners = new Set<
    (update: ExternalJobUpdate) => Promise<void>
  >();
  private readonly _reconnects = new Set<(agentId: string) => void>();

  async dispatch(job: ExternalJobDispatch): Promise<ExternalJobUpdate> {
    if (!this.available) throw new JobError("NO_AGENT", "нет агента");

    this.dispatched.push(job);
    if ((job.data as { quick?: boolean }).quick) {
      return {
        agentId: AGENT_ID,
        worker: "echo",
        workId: job.jobId,
        kind: "done",
        result: { quick: job.target.type },
      };
    }

    const update = {
      agentId: AGENT_ID,
      worker: "echo",
      workId: `w-${job.jobId}`,
      kind: "progress" as const,
    };

    this._works.set(update.workId, update);

    return update;
  }

  async poll(
    assignment: ExternalJobAssignment,
  ): Promise<ExternalJobUpdate | null> {
    return this._works.get(assignment.workId) ?? null;
  }

  async cancel(assignment: ExternalJobAssignment): Promise<void> {
    this.cancelled.push(assignment.workId);
  }

  onUpdate(listener: (update: ExternalJobUpdate) => Promise<void>) {
    this._listeners.add(listener);

    return () => this._listeners.delete(listener);
  }

  onReconnect(listener: (agentId: string) => void) {
    this._reconnects.add(listener);

    return () => this._reconnects.delete(listener);
  }

  /** Событие воркера о работе: слушателям (как до подтверждения агенту). */
  async emit(workId: string, patch: Partial<ExternalJobUpdate>) {
    const update = {
      agentId: AGENT_ID,
      worker: "echo",
      workId,
      kind: "progress" as const,
      ...patch,
    };

    this._works.set(workId, update);
    for (const listener of this._listeners) await listener(update);
  }

  /** Состояние для опроса без события (событие потерялось). */
  set(workId: string, patch: Partial<ExternalJobUpdate>): void {
    const current = this._works.get(workId);

    if (current) this._works.set(workId, { ...current, ...patch });
  }

  forget(workId: string): void {
    this._works.delete(workId);
  }

  reconnect(agentId: string): void {
    for (const listener of this._reconnects) listener(agentId);
  }
}

const flakyAttempts: number[] = [];
const completedExternal: { id: string; result: unknown; inTx: boolean }[] = [];
const completedData: unknown[] = [];
const failedExternal: { id: string; failure: ExternalJobFailure }[] = [];
const executor = new FakeExecutor();

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
      job: { type: "it.run", worker: "echo" },
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
      completedData.push(ctx.data);
    },
    onFail: async (job: ExternalJobInfo, failure: ExternalJobFailure) => {
      failedExternal.push({ id: job.id, failure });
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
    tracker = new JobRunTracker(runs, eventBus, signals, new JobRunViews());
    boss = new TestPgBossService();

    const registry = new JobHandlerRegistry();
    const watcher = new JobCancelWatcher(signals, runs, boss);

    reaper = new JobLeaseReaper(runs, tracker, boss);
    external = new ExternalJobService(
      runs,
      tracker,
      registry,
      dataSource,
      boss,
      executor,
    );
    queue = new PgBossJobQueue(
      boss,
      registry,
      tracker,
      watcher,
      external,
      new JobResultWaiter(signals, runs),
      signals,
      dataSource,
    );
    bootstrap = new JobsBootstrap(
      boss,
      registry,
      new JobRunner(tracker, watcher),
      watcher,
      signals,
      reaper,
      external,
      handlers,
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

  /** Задача передана воркеру: id работы у него. */
  const workIdOf = (id: string) =>
    waitFor(async () => (await runs.findById(id))?.externalId);

  const settled = (id: string, status: EJobRunStatus) =>
    waitFor(async () => {
      const found = await runs.findById(id);

      return found?.status === status && found;
    });

  it("внешняя: передача воркеру сразу после постановки (задача pg-boss ещё ждёт), ход, итог в транзакции", async () => {
    const started = Date.now();
    const id = (await queue.enqueue("it.external", { n: 1 })) as string;
    const workId = await workIdOf(id);

    expect(Date.now() - started).to.be.below(3_000);
    expect(await bossState(id)).to.equal("created");
    expect(executor.dispatched.at(-1)).to.deep.include({
      jobId: id,
      queue: "it.external",
      attempt: 0,
      data: { n: 1 },
      target: { type: "it.run", worker: "echo" },
    });

    const attached = await runs.findById(id);

    expect(attached?.status).to.equal(EJobRunStatus.RUNNING);
    expect(attached?.agentId).to.equal(AGENT_ID);
    expect(attached?.worker).to.equal("echo");
    expect(attached?.deadlineAt).to.be.instanceOf(Date);

    await executor.emit(workId, { progress: 0.5, text: "половина" });

    const running = await runs.findById(id);

    expect(running?.progress).to.equal(0.5);
    expect(running?.progressText).to.equal("половина");

    await executor.emit(workId, { kind: "done", result: { sum: 2 } });
    // Повтор события (подтверждение агенту потерялось) ничего не меняет.
    await executor.emit(workId, { kind: "done", result: { sum: 3 } });

    const done = await settled(id, EJobRunStatus.COMPLETED);

    expect(done.result).to.deep.equal({ sum: 2 });
    expect(completedExternal.filter(c => c.id === id)).to.deep.equal([
      { id, result: { sum: 2 }, inTx: true },
    ]);
    expect(completedData).to.deep.include({ n: 1 });
  });

  it("внешняя быстрая: итог из ответа воркера, без событий", async () => {
    const id = (await queue.enqueue("it.external", {
      quick: true,
    })) as string;
    const done = await settled(id, EJobRunStatus.COMPLETED);

    expect(done.result).to.deep.equal({ quick: "it.run" });
    expect(done.externalId).to.equal(id);
    expect(completedExternal.map(c => c.id)).to.include(id);
  });

  it("внешняя из outbox-транзакции: передаётся только после коммита", async () => {
    const before = executor.dispatched.length;
    const id = (await dataSource.transaction(async manager => {
      const jobId = await queue.enqueue("it.external", { n: 9 }, { manager });

      await sleep(300);
      expect(executor.dispatched.length).to.equal(before);

      return jobId;
    })) as string;

    await workIdOf(id);
  });

  it("внешняя: нет агента — ждёт без ошибки; агент подключился — передаётся сразу", async () => {
    executor.available = false;

    const id = (await queue.enqueue("it.external", { n: 10 })) as string;
    const waiting = await waitFor(async () => {
      const found = await runs.findById(id);

      return found?.error?.code === "NO_AGENT" && found;
    });

    expect(waiting.status).to.equal(EJobRunStatus.QUEUED);
    executor.available = true;
    executor.reconnect(AGENT_ID);
    await workIdOf(id);
  });

  it("внешняя: событие другой задачи воркера той же записи — пропускается", async () => {
    const id = (await queue.enqueue("it.external", { n: 7 })) as string;

    await workIdOf(id);
    await executor.emit("другой-id", { jobId: id, kind: "done", result: 1 });

    // Работа связана с другим id — событие не этой попытки.
    expect((await runs.findById(id))?.status).to.equal(EJobRunStatus.RUNNING);
  });

  it("внешняя: окончательная ошибка — failed и onFail; request — 502", async () => {
    const failing = queue.request(
      "it.external",
      { n: 2 },
      { timeoutMs: 15_000 },
    );
    const job = await waitFor(async () =>
      executor.dispatched.find(d => (d.data as { n: number }).n === 2),
    );
    const workId = await workIdOf(job.jobId);

    await executor.emit(workId, {
      kind: "failed",
      error: { code: "BAD_MODEL", message: "веса повреждены" },
    });

    try {
      await failing;
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err.status).to.equal(502);
      expect(err.reason).to.include({ code: "BAD_MODEL" });
    }

    expect(failedExternal.map(f => f.id)).to.include(job.jobId);
  });

  it("внешняя: отмена уходит воркеру", async () => {
    const cancelId = (await queue.enqueue("it.external", { n: 3 })) as string;
    const cancelWork = await workIdOf(cancelId);

    await queue.cancel(cancelId);

    expect(executor.cancelled).to.include(cancelWork);
    expect((await runs.findById(cancelId))?.status).to.equal(
      EJobRunStatus.CANCELLED,
    );
  });

  it("внешняя: сверка после подключения агента и срок задачи", async () => {
    const id = (await queue.enqueue("it.external", { n: 5 })) as string;
    const workId = await workIdOf(id);
    const lostId = (await queue.enqueue("it.external", { n: 6 })) as string;

    // Итог есть у воркера, а событие потерялось; вторую работу воркер забыл.
    executor.set(workId, { kind: "done", result: { late: true } });
    executor.forget(await workIdOf(lostId));
    executor.reconnect(AGENT_ID);

    expect((await settled(id, EJobRunStatus.COMPLETED)).result).to.deep.equal({
      late: true,
    });
    expect((await settled(lostId, EJobRunStatus.FAILED)).error?.code).to.equal(
      "EXTERNAL_JOB_LOST",
    );

    const slowId = (await queue.enqueue("it.external", { n: 8 })) as string;
    const slowWork = await workIdOf(slowId);

    await runs.update({ id: slowId }, { deadlineAt: new Date(Date.now() - 1) });
    expect(await external.failExpired()).to.equal(1);
    expect((await runs.findById(slowId))?.error?.code).to.equal("JOB_TIMEOUT");
    expect(executor.cancelled).to.include(slowWork);
  });
});
