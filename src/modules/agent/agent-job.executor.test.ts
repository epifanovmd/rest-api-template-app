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

/** Ответ воркера на запрос через агента. */
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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
  let signals: { on: sinon.SinonStub; notify: sinon.SinonStub };
  let executor: AgentJobExecutor;

  beforeEach(() => {
    agents = {
      listAgents: sinon.stub().resolves([agent("a1")]),
      getAgent: sinon.stub().callsFake(async (id: string) => agent(id)),
      fetch: sinon.stub().callsFake(async () => reply(202, { id: "w1" })),
    };
    runtime = {
      agents,
      instanceId: "me",
      hasConnections: true,
      onWorkerEvent: sinon.stub(),
      onReconnect: sinon.stub(),
      isLocal: (a: { session?: { instance: string } }) =>
        a.session?.instance === "me",
    };
    signals = { on: sinon.stub(), notify: sinon.stub().resolves() };
    executor = new AgentJobExecutor(runtime as any, signals as any);
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

  it("долгая задача: агент с типом в манифесте, POST /jobs без ожидания итога, id задачи у воркера", async () => {
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

    const [agentId, worker, path, init] = agents.fetch.firstCall.args;

    expect([agentId, worker, path, init.method]).to.deep.equal([
      "a1",
      "echo",
      "/jobs",
      "POST",
    ]);
    expect(JSON.parse(init.body)).to.deep.equal({
      type: "echo.long",
      jobId: "j1",
      data: { text: "hi" },
      files: { outputs: { result: "https://s3/put" } },
    });
  });

  it("быстрая задача: итог сразу, id — id записи", async () => {
    agents.fetch.resolves(reply(200, { result: { text: "HI" } }));

    expect(
      await executor.dispatch(job({ type: "echo.quick", worker: "echo" })),
    ).to.deep.include({ kind: "done", workId: "j1", result: { text: "HI" } });
  });

  it("нет агента с типом — NO_AGENT; агент на связи с другой копией — AGENT_ELSEWHERE", async () => {
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
      (err: any) =>
        expect([err.code, err.retryable]).to.deep.equal([
          "AGENT_ELSEWHERE",
          true,
        ]),
    );
    expect(agents.fetch.called).to.equal(false);
  });

  it("data не по схеме типа задачи — JOB_INVALID без повторов, воркеру не передаётся", async () => {
    agents.listAgents.resolves([
      agent("a1", {
        workers: [
          {
            name: "echo",
            state: "running",
            health: { ok: true },
            manifest: {
              version: "1.0.0",
              jobs: [
                {
                  type: "echo.long",
                  schema: {
                    type: "object",
                    required: ["text"],
                    properties: { text: { type: "string", maxLength: 1 } },
                  },
                },
              ],
            },
          },
        ],
      }),
    ]);

    await executor.dispatch(job()).then(
      () => expect.fail("должно было упасть"),
      (err: any) =>
        expect([err.code, err.retryable]).to.deep.equal(["JOB_INVALID", false]),
    );
    expect(agents.fetch.called).to.equal(false);
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

  it("отказ воркера: неверная или необъявленная задача — без повторов; занят (409), сбой и связь — с повтором", async () => {
    const codeOf = () =>
      executor.dispatch(job()).then(
        () => expect.fail("должно было упасть"),
        (err: any) => [err.code, err.retryable],
      );

    agents.fetch.resolves(reply(400, { message: "плохо" }));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", false]);
    agents.fetch.resolves(reply(409, { message: "занят" }));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", true]);
    agents.fetch.resolves(reply(500, { message: "упал" }));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", true]);
    agents.fetch.resolves(reply(202, {}));
    expect(await codeOf()).to.deep.equal(["JOB_REJECTED", true]);
    // Тип не объявлен в манифесте воркера (агент проверяет сам) — окончательно.
    agents.fetch.rejects(new AgentsError("JOB_UNKNOWN", "нет типа", 409));
    expect(await codeOf()).to.deep.equal(["JOB_UNKNOWN", false]);
    agents.fetch.rejects(new AgentsError("ROUTE_UNDECLARED", "нет задач", 404));
    expect(await codeOf()).to.deep.equal(["ROUTE_UNDECLARED", false]);
    agents.fetch.rejects(new AgentsError("WORKER_UNAVAILABLE", "нет", 502));
    expect(await codeOf()).to.deep.equal(["WORKER_UNAVAILABLE", true]);
  });

  it("опрос: задачи нет — null; состояние done — итог", async () => {
    const assignment = { agentId: "a1", worker: "echo", workId: "w1" };

    agents.fetch.resolves(reply(404, { message: "нет" }));
    expect(await executor.poll(assignment)).to.equal(null);

    agents.fetch.resolves(
      reply(200, { id: "w1", state: "done", result: "HI" }),
    );
    expect(await executor.poll(assignment)).to.deep.include({
      kind: "done",
      workId: "w1",
      result: "HI",
    });
    expect(agents.fetch.lastCall.args.slice(0, 3)).to.deep.equal([
      "a1",
      "echo",
      "/jobs/w1",
    ]);
    expect(agents.fetch.lastCall.args[3].method).to.equal("GET");
  });

  it("отмена — POST /jobs/{id}/cancel; задачи уже нет — не ошибка", async () => {
    const assignment = { agentId: "a1", worker: "echo", workId: "w1" };

    agents.fetch.resolves(reply(200, { id: "w1", state: "cancelled" }));
    await executor.cancel(assignment);
    expect(agents.fetch.firstCall.args.slice(0, 3)).to.deep.equal([
      "a1",
      "echo",
      "/jobs/w1/cancel",
    ]);
    expect(agents.fetch.firstCall.args[3].method).to.equal("POST");

    agents.fetch.resolves(reply(404, { message: "нет" }));
    await executor.cancel(assignment);
  });

  it("отмена из процесса без соединения агента — сигналом процессу с соединением; он отменяет у воркера", async () => {
    const assignment = { agentId: "a1", worker: "echo", workId: "w1" };

    agents.getAgent.resolves(
      agent("a1", { session: { id: "s", instance: "api-1", since: 1 } }),
    );
    await executor.cancel(assignment);
    expect(agents.fetch.called).to.equal(false);
    const [channel, payload] = signals.notify.firstCall.args;

    expect(channel).to.equal("agent_job_control");
    expect(JSON.parse(payload)).to.deep.equal({
      op: "cancel",
      instance: "api-1",
      ...assignment,
    });

    // Процесс с соединением: команда ему — отмена у воркера; чужая — мимо.
    const onSignal = signals.on.firstCall.args[1] as (p: string) => void;

    agents.fetch.resolves(reply(200, { id: "w1", state: "cancelled" }));
    onSignal(payload);
    onSignal(JSON.stringify({ ...JSON.parse(payload), instance: "me" }));
    onSignal("не json");
    await new Promise(r => setImmediate(r));
    expect(agents.fetch.callCount).to.equal(1);
    expect(agents.fetch.firstCall.args[2]).to.equal("/jobs/w1/cancel");

    // Агент без связи — отмена здесь (итог — как без сигналов).
    agents.getAgent.resolves(agent("a1", { online: false }));
    signals.notify.resetHistory();
    await executor.cancel(assignment);
    expect(signals.notify.called).to.equal(false);
  });

  it("передаёт задачи только процесс с соединениями агентов", () => {
    expect(executor.canDispatch).to.equal(true);
    runtime.hasConnections = false;
    expect(executor.canDispatch).to.equal(false);
  });
});
