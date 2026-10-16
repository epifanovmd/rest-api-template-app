import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { getRequestId, JobError } from "../../core";
import { JobRunner } from "./job.runner";

const createJob = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "job-1",
    name: "test.queue",
    data: { x: 1 },
    retryCount: 0,
    retryLimit: 3,
    signal: new AbortController().signal,
    ...overrides,
  }) as any;

const handlerOf = (handle: (ctx: any) => Promise<unknown>) => ({
  definition: { queue: "test.queue" },
  handle: sinon.stub().callsFake(handle),
});

describe("JobRunner", () => {
  let metrics: { onStart: sinon.SinonStub; onComplete: sinon.SinonStub };
  let runner: JobRunner;

  beforeEach(() => {
    metrics = { onStart: sinon.stub(), onComplete: sinon.stub() };
    runner = new JobRunner(metrics);
  });

  it("выполняет задачу в контексте requestId job:<queue>:<id>", async () => {
    let requestId: string | undefined;
    const handler = handlerOf(async ctx => {
      requestId = getRequestId();
      expect(ctx).to.include({ id: "job-1", queue: "test.queue", attempt: 0 });
      expect(ctx.data).to.deep.equal({ x: 1 });

      return { done: true };
    });

    const result = await runner.run(handler as any, createJob());

    expect(requestId).to.equal("job:test.queue:job-1");
    expect(result).to.deep.equal({
      id: "job-1",
      status: "completed",
      output: { done: true },
    });
    expect(metrics.onStart.calledWith("test.queue")).to.be.true;
    expect(metrics.onComplete.firstCall.args[2]).to.equal(true);
  });

  it("ошибка — failed (pg-boss повторит)", async () => {
    const handler = handlerOf(async () => {
      throw new Error("boom");
    });

    const result = await runner.run(handler as any, createJob());

    expect(result).to.deep.include({ status: "failed" });
    expect(result.output).to.deep.equal({
      code: "JOB_FAILED",
      message: "boom",
    });
    expect(metrics.onComplete.firstCall.args[2]).to.equal(false);
  });

  it("JobError retryable=false — deadletter без повторов", async () => {
    const handler = handlerOf(async () => {
      throw new JobError("BAD_INPUT", "плохие данные", false);
    });

    const result = await runner.run(handler as any, createJob());

    expect(result.status).to.equal("deadletter");
    expect(result.output).to.deep.equal({
      code: "BAD_INPUT",
      message: "плохие данные",
    });
  });

  it("сигнал pg-boss передаётся обработчику", async () => {
    const bossAbort = new AbortController();
    const handler = handlerOf(
      ctx =>
        new Promise((_, reject) => {
          ctx.signal.addEventListener("abort", () =>
            reject(new Error("shutdown")),
          );
          bossAbort.abort();
        }),
    );

    const result = await runner.run(
      handler as any,
      createJob({ signal: bossAbort.signal }),
    );

    expect(result.status).to.equal("failed");
  });
});
