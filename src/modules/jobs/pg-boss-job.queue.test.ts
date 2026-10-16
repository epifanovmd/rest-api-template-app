import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { HttpException } from "../../core";
import { JobsError } from "./jobs.errors";
import { PgBossJobQueue } from "./pg-boss-job.queue";

describe("PgBossJobQueue", () => {
  let boss: { send: sinon.SinonStub };
  let registry: { get: sinon.SinonStub };
  let txManager: { queryRunner: { query: sinon.SinonStub } };
  let queue: PgBossJobQueue;

  beforeEach(() => {
    boss = { send: sinon.stub().resolves("job-1") };
    registry = { get: sinon.stub().returns({ definition: { queue: "q" } }) };
    txManager = {
      queryRunner: {
        query: sinon.stub().resolves({ records: [{ id: "job-1" }] }),
      },
    };
    queue = new PgBossJobQueue(
      { ready: sinon.stub().resolves(boss) } as any,
      registry as any,
    );
  });

  it("неизвестная очередь — ошибка JOB_UNKNOWN_QUEUE", async () => {
    registry.get.returns(undefined);

    try {
      await queue.enqueue("nope", {});
      expect.fail("должно было упасть");
    } catch (err) {
      expect(err).to.be.instanceOf(HttpException);
      expect((err as HttpException).code).to.equal(
        JobsError.codes.UNKNOWN_QUEUE,
      );
    }
  });

  it("send с опциями постановки", async () => {
    const id = await queue.enqueue(
      "mail.send",
      { to: "a" },
      { startAfter: 30, singletonKey: "k", priority: 5 },
    );

    expect(id).to.equal("job-1");
    expect(boss.send.firstCall.args[2]).to.deep.equal({
      startAfter: 30,
      singletonKey: "k",
      priority: 5,
    });
  });

  it("с manager: send через транзакцию (outbox)", async () => {
    await queue.enqueue("mail.send", {}, { manager: txManager as any });

    const { db } = boss.send.firstCall.args[2];
    const result = await db.executeSql("SELECT 1", [1]);

    expect(txManager.queryRunner.query.calledWith("SELECT 1", [1], true)).to.be
      .true;
    expect(result).to.deep.equal({ rows: [{ id: "job-1" }] });
  });

  it("дедупликация: send вернул null", async () => {
    boss.send.resolves(null);

    expect(await queue.enqueue("mail.send", {}, { singletonKey: "k" })).to.be
      .null;
  });
});
