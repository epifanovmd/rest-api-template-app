import "reflect-metadata";

import { AgentsError } from "agent-sdk/server";
import { expect } from "chai";
import sinon from "sinon";

import { AgentJobExecutor, eventUpdate, jobUpdate } from "./agent-job.executor";

const TARGET = { type: "echo.long", worker: "echo" };

const manifest = {
  version: "1.0.0",
  jobs: [{ type: "echo.quick" }, { type: "echo.long" }],
};

const agent = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  online: true,
  revoked: false,
  session: { id: "s", instance: "me", since: 1 },
  workers: [{ name: "echo", state: "running", manifest, health: { ok: true } }],
  ...patch,
});

const event = (type: string, data: unknown) => ({
  id: "m1",
  agentId: "a1",
  worker: "echo",
  type,
  data,
  at: 1,
  receivedAt: 2,
});

const job = (target = TARGET) => ({
  jobId: "j1",
  queue: "demo.echo",
  attempt: 0,
  data: { text: "hi" },
  target,
});

describe("AgentJobExecutor", () => {
  let agents: Record<string, sinon.SinonStub>;
  let runtime: Record<string, any>;
  let executor: AgentJobExecutor;

  beforeEach(() => {
    agents = {
      listAgents: sinon.stub().resolves([agent("a1")]),
      runJob: sinon
        .stub()
        .resolves({ jobId: "j1", id: "w1", state: "running", progress: 0 }),
      jobStatus: sinon.stub(),
      cancelJob: sinon.stub().resolves({ id: "w1", state: "cancelled" }),
    };
    runtime = {
      agents,
      relayEnabled: false,
      hasConnections: true,
      onWorkerEvent: sinon.stub(),
      onReconnect: sinon.stub(),
      isLocal: (a: { session?: { instance: string } }) =>
        a.session?.instance === "me",
    };
    executor = new AgentJobExecutor(runtime as any);
  });

  it("события задач job.* → ход и итог; чужие события и без id — нет", () => {
    expect(
      eventUpdate(
        event("job.progress", {
          jobId: "j1",
          id: "w1",
          progress: 0.25,
          message: "шаг 1 из 4",
        }),
      ),
    ).to.deep.equal({
      agentId: "a1",
      worker: "echo",
      workId: "w1",
      kind: "progress",
      jobId: "j1",
      progress: 0.25,
      text: "шаг 1 из 4",
    });
    expect(
      eventUpdate(event("job.done", { id: "w1", jobId: "j1", result: 5 })),
    ).to.deep.include({ kind: "done", jobId: "j1", result: 5 });
    expect(
      eventUpdate(
        event("job.failed", {
          id: "w1",
          error: { code: "ECHO_FAILED", message: "упал" },
        }),
      )?.error,
    ).to.deep.equal({ code: "ECHO_FAILED", message: "упал" });
    expect(eventUpdate(event("job.cancelled", { id: "w1" }))?.kind).to.equal(
      "cancelled",
    );
    expect(eventUpdate(event("echo.started", { id: "w1" }))).to.equal(null);
    expect(eventUpdate(event("job.done", { text: "без id" }))).to.equal(null);
  });

  it("провал без error — общий код", () => {
    expect(
      jobUpdate("a1", "echo", "failed", { id: "w1" })?.error,
    ).to.deep.equal({
      code: "WORKER_FAILED",
      message: "Воркер не выполнил задачу",
    });
  });

  it("долгая задача: агент с типом в манифесте, runJob без ожидания итога, id задачи у воркера", async () => {
    const update = await executor.dispatch({
      ...job(),
      files: { outputs: { result: "https://s3/put" } },
    });

    expect(update).to.deep.include({
      agentId: "a1",
      worker: "echo",
      workId: "w1",
      kind: "progress",
    });

    const [agentId, worker, opts] = agents.runJob.firstCall.args;

    expect([agentId, worker]).to.deep.equal(["a1", "echo"]);
    expect(opts).to.deep.include({
      type: "echo.long",
      jobId: "j1",
      data: { text: "hi" },
      files: { outputs: { result: "https://s3/put" } },
      timeoutMs: 1,
    });
  });

  it("быстрая задача: итог сразу, id — id записи", async () => {
    agents.runJob.resolves({
      jobId: "j1",
      state: "done",
      result: { text: "HI" },
    });

    expect(
      await executor.dispatch(job({ type: "echo.quick", worker: "echo" })),
    ).to.deep.include({ kind: "done", workId: "j1", result: { text: "HI" } });
  });

  it("нет агента с типом — NO_AGENT; без пересылки агент другой копии — AGENT_ELSEWHERE, с пересылкой — подходит", async () => {
    await executor.dispatch(job({ type: "other.run", worker: "echo" })).then(
      () => expect.fail("должно было упасть"),
      (err: any) =>
        expect([err.code, err.retryable]).to.deep.equal(["NO_AGENT", true]),
    );

    agents.listAgents.resolves([
      agent("a2", { session: { id: "s", instance: "other", since: 1 } }),
    ]);
    await executor.dispatch(job()).then(
      () => expect.fail("должно было упасть"),
      (err: any) => expect(err.code).to.equal("AGENT_ELSEWHERE"),
    );

    runtime.relayEnabled = true;
    expect((await executor.dispatch(job())).agentId).to.equal("a2");
  });

  it("свободный воркер — раньше занятого", async () => {
    agents.listAgents.resolves([
      agent("busy", {
        workers: [
          {
            name: "echo",
            state: "running",
            manifest,
            health: { ok: true, busy: true },
          },
        ],
      }),
      agent("free"),
    ]);

    for (let i = 0; i < 5; i += 1) {
      expect((await executor.dispatch(job())).agentId).to.equal("free");
    }
  });

  it("отказ воркера: неверная задача (400) — без повторов; занят (409), сбой и связь — с повтором", async () => {
    const codeOf = () =>
      executor.dispatch(job()).then(
        () => expect.fail("должно было упасть"),
        (err: any) => [err.code, err.retryable],
      );

    agents.runJob.rejects(new AgentsError("JOB_REJECTED", "плохо", 400));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", false]);
    agents.runJob.rejects(new AgentsError("JOB_REJECTED", "занят", 409));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", true]);
    agents.runJob.rejects(new AgentsError("JOB_INVALID", "схема", 400));
    expect(await codeOf()).to.deep.equal(["JOB_INVALID", false]);
    agents.runJob.rejects(new AgentsError("WORKER_UNAVAILABLE", "нет", 502));
    expect(await codeOf()).to.deep.equal(["WORKER_UNAVAILABLE", true]);
  });

  it("опрос: задачи нет — null; состояние done — итог", async () => {
    const assignment = { agentId: "a1", worker: "echo", workId: "w1" };

    agents.jobStatus.rejects(new AgentsError("JOB_NOT_FOUND", "нет", 404));
    expect(await executor.poll(assignment)).to.equal(null);

    agents.jobStatus.resolves({ id: "w1", state: "done", result: "HI" });
    expect(await executor.poll(assignment)).to.deep.include({
      kind: "done",
      workId: "w1",
      result: "HI",
    });
    expect(agents.jobStatus.lastCall.args).to.deep.equal(["a1", "echo", "w1"]);
  });

  it("отмена — cancelJob; задачи уже нет — не ошибка", async () => {
    const assignment = { agentId: "a1", worker: "echo", workId: "w1" };

    await executor.cancel(assignment);
    expect(agents.cancelJob.firstCall.args).to.deep.equal(["a1", "echo", "w1"]);

    agents.cancelJob.rejects(new AgentsError("JOB_NOT_FOUND", "нет", 404));
    await executor.cancel(assignment);
  });

  it("передавать может процесс с соединениями или с пересылкой", () => {
    expect(executor.canDispatch).to.equal(true);
    runtime.hasConnections = false;
    expect(executor.canDispatch).to.equal(false);
    runtime.relayEnabled = true;
    expect(executor.canDispatch).to.equal(true);
  });
});
