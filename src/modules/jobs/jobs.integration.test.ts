import "reflect-metadata";

import { expect } from "chai";
import type { ConstructorOptions } from "pg-boss";
import { PgBoss } from "pg-boss";
import { setTimeout as sleep } from "timers/promises";
import { DataSource } from "typeorm";

import { IJobHandler, JobContext, JobError } from "../../core";
import { JobRunner } from "./job.runner";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobsBootstrap } from "./jobs.bootstrap";
import { PGBOSS_SCHEMA } from "./jobs.types";
import { PgBossService } from "./pg-boss.service";
import { PgBossJobQueue } from "./pg-boss-job.queue";

/**
 * Интеграция с настоящим Postgres: `TEST_DATABASE_URL=postgres://…`.
 * Без переменной набор пропускается. БД — одноразовая: схема pgboss
 * пересоздаётся.
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

const echoed: unknown[] = [];
const flakyAttempts: number[] = [];

const handlers: IJobHandler<any, any>[] = [
  {
    definition: { queue: "it.echo" },
    handle: async (ctx: JobContext<{ text: string }>) => {
      echoed.push(ctx.data);

      return { echo: ctx.data.text };
    },
  },
  {
    definition: {
      queue: "it.flaky",
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
    definition: { queue: "it.fatal", retryLimit: 3 },
    handle: async () => {
      throw new JobError("BAD_INPUT", "плохие данные", false);
    },
  },
];

describe("JobQueue на pg-boss (интеграция, TEST_DATABASE_URL)", function () {
  this.timeout(60_000);

  let dataSource: DataSource;
  let queue: PgBossJobQueue;
  let bootstrap: JobsBootstrap;

  const bossJob = async (id: string) => {
    const rows: { state: string; retry_count: number; output: unknown }[] =
      await dataSource.query(
        `SELECT state, retry_count, output FROM ${PGBOSS_SCHEMA}.job WHERE id = $1`,
        [id],
      );

    return rows[0];
  };

  const settled = (id: string, state: string) =>
    waitFor(async () => {
      const job = await bossJob(id);

      return job?.state === state && job;
    });

  before(async function () {
    if (!DATABASE_URL) this.skip();

    dataSource = new DataSource({ type: "postgres", url: DATABASE_URL });
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS ${PGBOSS_SCHEMA} CASCADE`);
    await dataSource.query(
      "CREATE TABLE IF NOT EXISTS it_outbox (id serial PRIMARY KEY, note text)",
    );

    const boss = new TestPgBossService();
    const registry = new JobHandlerRegistry();

    queue = new PgBossJobQueue(boss, registry);
    bootstrap = new JobsBootstrap(boss, registry, new JobRunner(), handlers);
    await bootstrap.initialize();
  });

  after(async () => {
    await bootstrap?.destroy();
    if (dataSource?.isInitialized) {
      await dataSource.query("DROP TABLE IF EXISTS it_outbox");
      await dataSource.destroy();
    }
  });

  it("enqueue → work → completed с результатом", async () => {
    const id = (await queue.enqueue("it.echo", { text: "привет" })) as string;
    const job = await settled(id, "completed");

    expect(job.output).to.deep.equal({ echo: "привет" });
  });

  it("повтор после ошибки: вторая попытка успешна", async () => {
    const id = (await queue.enqueue("it.flaky", {})) as string;

    await settled(id, "completed");
    expect(flakyAttempts).to.deep.equal([0, 1]);
  });

  it("JobError retryable=false — без повторов, failed", async () => {
    const id = (await queue.enqueue("it.fatal", {})) as string;
    const job = await settled(id, "failed");

    expect(job.retry_count).to.equal(0);
    expect(job.output).to.deep.include({ code: "BAD_INPUT" });
  });

  it("outbox: откат транзакции отменяет и задачу", async () => {
    let id: string | null = null;

    await dataSource
      .transaction(async manager => {
        await manager.query("INSERT INTO it_outbox (note) VALUES ('rollback')");
        id = await queue.enqueue("it.echo", { text: "откат" }, { manager });
        throw new Error("откат");
      })
      .catch(() => undefined);

    expect(id).to.be.a("string");
    expect(await bossJob(id as unknown as string)).to.be.undefined;
  });

  it("outbox: коммит — задача выполняется", async () => {
    const id = await dataSource.transaction(async manager => {
      await manager.query("INSERT INTO it_outbox (note) VALUES ('commit')");

      return queue.enqueue("it.echo", { text: "коммит" }, { manager });
    });

    await settled(id as string, "completed");
    expect(echoed).to.deep.include({ text: "коммит" });
  });
});
