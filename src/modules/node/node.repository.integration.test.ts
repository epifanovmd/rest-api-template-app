import "reflect-metadata";

import { expect } from "chai";
import { randomBytes, randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { AppModule } from "../../app.module";
import { collectEntities } from "../../core";
import { migrations } from "../../migrations";
import { EJobRunStatus, JobRun, JobRunRepository } from "../jobs";
import { Node } from "./node.entity";
import { NodeRepository } from "./node.repository";
import { NODE_INSTALL_QUEUE, NODE_UNINSTALL_QUEUE } from "./node.types";

/**
 * Узлы на настоящем Postgres: `TEST_DATABASE_URL=postgres://…/<база с test
 * или e2e в имени>`. Без переменной набор пропускается. Схема `public`
 * пересоздаётся: все миграции применяются, три последние (узлы, агенты с
 * воркерами, имя агента узла) откатываются и применяются снова.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL;

const insertUser = async (
  dataSource: DataSource,
  email: string,
  name?: { first: string; last: string },
): Promise<string> => {
  const id = randomUUID();

  await dataSource.query(
    `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')`,
    [id, email],
  );
  if (name) {
    await dataSource.query(
      `INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3)`,
      [id, name.first, name.last],
    );
  }

  return id;
};

describe("NodeRepository (Postgres, TEST_DATABASE_URL)", function () {
  this.timeout(60_000);

  let dataSource: DataSource;
  let nodes: NodeRepository;
  let runs: JobRunRepository;

  before(async function () {
    if (!DATABASE_URL) this.skip();
    if (!/e2e|test/i.test(new URL(DATABASE_URL).pathname)) {
      throw new Error("TEST_DATABASE_URL: база должна быть тестовой");
    }

    dataSource = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      entities: collectEntities(AppModule),
      migrations,
    });
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS public CASCADE`);
    await dataSource.query(`CREATE SCHEMA public`);
    await dataSource.runMigrations();
    nodes = new NodeRepository(dataSource, Node);
    runs = new JobRunRepository(dataSource, JobRun);
  });

  after(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it("миграции узлов и агентов откатываются и применяются снова", async () => {
    const tableExists = async (table: string) =>
      (
        await dataSource.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [
          `public.${table}`,
        ])
      )[0].ok as boolean;

    const columnExists = async (table: string, column: string) =>
      (
        await dataSource.query(
          `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
          [table, column],
        )
      )[0].n === 1;

    await dataSource.undoLastMigration();
    expect(await columnExists("agent_events", "problems")).to.equal(false);
    await dataSource.undoLastMigration();
    expect(await columnExists("job_runs", "job_type")).to.equal(false);
    expect(await columnExists("job_runs", "outputs")).to.equal(false);
    await dataSource.undoLastMigration();
    expect(await columnExists("nodes", "agent_name")).to.equal(false);
    expect(await columnExists("job_runs", "stop_requested")).to.equal(true);
    await dataSource.undoLastMigration();
    expect(await tableExists("agent_configs")).to.equal(false);
    expect(await tableExists("agent_jobs")).to.equal(true);
    await dataSource.undoLastMigration();
    expect(await tableExists("nodes")).to.equal(false);
    await dataSource.runMigrations();
    expect(await tableExists("nodes")).to.equal(true);
    expect(await tableExists("agent_configs")).to.equal(true);
    expect(await tableExists("agent_jobs")).to.equal(false);
    expect(await columnExists("nodes", "agent_name")).to.equal(true);
    expect(await columnExists("job_runs", "job_type")).to.equal(true);
    expect(await columnExists("job_runs", "outputs")).to.equal(true);
    expect(await columnExists("agent_events", "problems")).to.equal(true);
  });

  it("миграция имени агента узла: имя привязанного агента сохраняется у узла", async () => {
    const agentId = randomBytes(16).toString("hex");

    // Последние — замечания событий и файлы итога задач, перед ними — имя агента узла.
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.query(
      `INSERT INTO agents (id, rev, name, enrolled_at, record) VALUES ($1, 0, 'old-host', 1, '{}')`,
      [agentId],
    );

    const [{ id }] = await dataSource.query(
      `INSERT INTO nodes (name, agent_id) VALUES ('узел', $1) RETURNING id`,
      [agentId],
    );

    await dataSource.runMigrations();
    expect((await nodes.findById(id))?.agentName).to.equal("old-host");
    await dataSource.query(`DELETE FROM nodes WHERE id = $1`, [id]);
    await dataSource.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
  });

  it("список: имена владельца и создателя, «свои», поиск, страницы", async () => {
    const alice = await insertUser(dataSource, "alice@example.com", {
      first: "Алиса",
      last: "Смирнова",
    });
    const bob = await insertUser(dataSource, "bob@example.com");
    const own = await nodes.createAndSave({
      name: "alpha",
      host: "10.0.0.1",
      ownerId: alice,
      createdById: bob,
    });

    await nodes.createAndSave({ name: "beta", createdById: bob });
    await nodes.createAndSave({
      name: "gamma 100%",
      host: "gamma.example.com",
    });

    const card = await nodes.findWithOwners(own.id);

    expect(card?.owner?.profile?.firstName).to.equal("Алиса");
    expect(card?.createdBy?.email).to.equal("bob@example.com");

    const [mine, mineTotal] = await nodes.findPage(
      { ownedBy: alice },
      { offset: 0, limit: 10 },
    );

    expect(mine.map(node => node.name)).to.deep.equal(["alpha"]);
    expect(mineTotal).to.equal(1);

    const [byCreator] = await nodes.findPage(
      { ownedBy: bob },
      { offset: 0, limit: 10 },
    );

    expect(byCreator.map(node => node.name)).to.deep.equal(["beta", "alpha"]);

    const [found] = await nodes.findPage(
      { query: "100%" },
      { offset: 0, limit: 10 },
    );

    expect(found.map(node => node.name)).to.deep.equal(["gamma 100%"]);

    const [page, total] = await nodes.findPage({}, { offset: 1, limit: 1 });

    expect(page).to.have.length(1);
    expect(total).to.equal(3);

    await dataSource.query(`DELETE FROM users WHERE id = $1`, [alice]);
    expect((await nodes.findById(own.id))?.ownerId, "владелец удалён").to.equal(
      null,
    );
  });

  it("агент: уникален, отвязка возвращает узел, агенты своих узлов", async () => {
    const owner = await insertUser(dataSource, "owner@example.com");
    const first = await nodes.createAndSave({ name: "n1", ownerId: owner });
    const second = await nodes.createAndSave({ name: "n2" });
    const agentId = randomBytes(16).toString("hex");

    expect(await nodes.setAgent(first.id, agentId, "host-1")).to.equal(true);
    await nodes.setAgent(second.id, agentId, "host-1").then(
      () => expect.fail("агент двух узлов"),
      (err: any) => expect(err.driverError?.code).to.equal("23505"),
    );
    expect((await nodes.findByAgentId(agentId))?.id).to.equal(first.id);
    expect(await nodes.findAgentIds(owner)).to.deep.equal([agentId]);
    expect(await nodes.findAgentIds()).to.include(agentId);

    expect(await nodes.clearAgent(agentId)).to.equal(first.id);
    expect(await nodes.clearAgent(agentId)).to.equal(null);
    expect(await nodes.findAgentIds(owner)).to.deep.equal([]);
    expect(
      (await nodes.findById(first.id))?.agentName,
      "имя остаётся",
    ).to.equal("host-1");
  });

  it("узлы без агента для привязки: по имени агента, имени узла, адресу; занятый узел не перехватывается", async () => {
    const byAgentName = await nodes.createAndSave({
      name: "старое имя",
      agentName: "match-host",
    });
    const byHost = await nodes.createAndSave({
      name: "по адресу",
      host: "10.9.9.9",
    });
    const busy = await nodes.createAndSave({
      name: "match-host",
      agentId: randomBytes(16).toString("hex"),
    });

    expect(
      (await nodes.findUnbound({ agentName: "match-host" })).map(n => n.id),
    ).to.deep.equal([byAgentName.id]);
    expect(await nodes.findUnbound({ name: "match-host" })).to.deep.equal([]);
    expect(
      (await nodes.findUnbound({ host: "10.9.9.9" })).map(n => n.id),
    ).to.deep.equal([byHost.id]);

    const agentId = randomBytes(16).toString("hex");

    expect(await nodes.bindFree(byHost.id, agentId, "new-host")).to.equal(true);
    expect(await nodes.bindFree(byHost.id, "f".repeat(32), "x")).to.equal(
      false,
    );
    expect(await nodes.bindFree(busy.id, "e".repeat(32), "x")).to.equal(false);
    expect(await nodes.findById(byHost.id)).to.deep.include({
      agentId,
      agentName: "new-host",
    });
  });

  it("последняя задача узла: одна на scope среди очередей узла", async () => {
    const nodeA = randomUUID();
    const nodeB = randomUUID();
    const run = async (
      scopeId: string,
      queue: string,
      status: EJobRunStatus,
      createdAt: string,
    ) => {
      const id = randomUUID();

      await dataSource.query(
        `INSERT INTO job_runs (id, queue, status, title, scope_type, scope_id, created_at)
         VALUES ($1, $2, $3, 't', 'node', $4, $5)`,
        [id, queue, status, scopeId, createdAt],
      );

      return id;
    };

    await run(nodeA, NODE_INSTALL_QUEUE, EJobRunStatus.FAILED, "2026-01-01");
    const latestA = await run(
      nodeA,
      NODE_UNINSTALL_QUEUE,
      EJobRunStatus.RUNNING,
      "2026-01-02",
    );

    await run(nodeA, "other.queue", EJobRunStatus.QUEUED, "2026-01-03");
    const latestB = await run(
      nodeB,
      NODE_INSTALL_QUEUE,
      EJobRunStatus.COMPLETED,
      "2026-01-01",
    );

    const latest = await runs.findLatestByScopes(
      "node",
      [nodeA, nodeB, randomUUID()],
      [NODE_INSTALL_QUEUE, NODE_UNINSTALL_QUEUE],
    );

    expect(latest.map(item => item.id).sort()).to.deep.equal(
      [latestA, latestB].sort(),
    );
    expect(await runs.findLatestByScopes("node", [], ["q"])).to.deep.equal([]);
  });
});
