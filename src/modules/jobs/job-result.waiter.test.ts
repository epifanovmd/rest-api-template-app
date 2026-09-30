import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { JobResultWaiter } from "./job-result.waiter";
import { JobSignals } from "./job-signals";
import { EJobRunStatus, JOB_SETTLED_CHANNEL } from "./jobs.types";

describe("JobResultWaiter", () => {
  let signals: JobSignals;
  let runs: { findById: sinon.SinonStub };
  let waiter: JobResultWaiter;

  beforeEach(() => {
    signals = new JobSignals({} as any);
    runs = {
      findById: sinon
        .stub()
        .resolves({ id: "job-1", status: EJobRunStatus.RUNNING }),
    };
    waiter = new JobResultWaiter(signals, runs as any);
  });

  it("сигнал завершения будит ожидание сразу", async () => {
    const pending = waiter.wait("job-1", 10_000);

    runs.findById.resolves({ id: "job-1", status: EJobRunStatus.COMPLETED });
    (signals as any).dispatch(JOB_SETTLED_CHANNEL, "job-1");

    expect((await pending)?.status).to.equal(EJobRunStatus.COMPLETED);
  });

  it("не дождались — null", async () => {
    expect(await waiter.wait("job-1", 50)).to.equal(null);
  });

  it("клиент отключился — ожидание снимается, null", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = waiter.wait("job-1", 10_000, controller.signal);

    controller.abort();

    expect(await pending).to.equal(null);
    expect(Date.now() - started).to.be.below(1_000);
  });

  it("уже прерванный сигнал — не ждёт", async () => {
    const controller = new AbortController();

    controller.abort();

    expect(await waiter.wait("job-1", 10_000, controller.signal)).to.equal(
      null,
    );
  });
});
