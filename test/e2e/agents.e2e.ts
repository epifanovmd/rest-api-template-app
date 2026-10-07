import { expect } from "chai";
import { createHash, verify } from "crypto";

import { rejectedUpgrade, TestAgent } from "./agent";
import {
  Actor,
  call,
  calledEndpoints,
  eventually,
  expectStatus,
  items,
  signInAdmin,
  signUp,
} from "./client";
import { AGENT_RELEASE, BASE_URL } from "./harness";

const ECHO = { name: "demo.echo", concurrency: 1 };
const COMMANDS = ["agent.logs", "agent.drain"];

describe("агенты (ALP)", () => {
  let admin: Actor;
  let alice: Actor;
  let agentId: string;
  let credentials: string;

  before(async () => {
    admin = await signInAdmin();
    alice = await signUp("ag-alice", { firstName: "Alice" });
  });

  it("регистрация: токен выдаётся один раз, исчерпывается, отзывается", async () => {
    expectStatus(
      await call(alice, "POST", "/api/v1/agent-enrollment-tokens", {
        name: "x",
      }),
      403,
    );

    const created = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment-tokens", {
        name: "e2e-fleet",
        labels: { pool: "e2e" },
        maxUses: 1,
      }),
      201,
    );
    const { token } = created.data;

    expect(token).to.match(/^[\w-]{8}\.[\w-]+$/);

    const list = expectStatus(
      await call(admin, "GET", "/api/v1/agent-enrollment-tokens"),
      200,
    );

    expect(JSON.stringify(list.data)).to.not.include(token.split(".")[1]);

    const enrolled = expectStatus(
      await call(null, "POST", "/api/v1/agent-link/enroll", {
        token,
        name: "e2e-agent",
        labels: { zone: "test" },
        host: { hostname: "e2e", os: "linux", arch: "amd64" },
      }),
      201,
    );

    agentId = enrolled.data.agentId;
    credentials = `${agentId}.${enrolled.data.secret}`;

    // maxUses: 1 — второй раз токен не работает.
    expectStatus(
      await call(null, "POST", "/api/v1/agent-link/enroll", {
        token,
        name: "again",
      }),
      401,
      "AGENT_ENROLLMENT_TOKEN_INVALID",
    );

    const agent = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}`),
      200,
    ).data;

    expect(agent.labels).to.deep.equal({ pool: "e2e", zone: "test" });
    expect(agent.status).to.equal("offline");

    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agent-enrollment-tokens/${created.data.enrollmentToken.id}/revoke`,
      ),
      204,
    );
  });

  it("канал: учётные данные и подпротокол проверяются до upgrade", async () => {
    expect(await rejectedUpgrade({})).to.equal(401);
    expect(
      await rejectedUpgrade({
        authorization: `Agent ${agentId}.wrong-secret`,
      }),
    ).to.equal(401);
    expect(
      await rejectedUpgrade({ authorization: `Agent ${credentials}` }, []),
    ).to.equal(426);
  });

  it("сессия: hello → welcome, агент на связи, живое состояние", async () => {
    const agent = new TestAgent(credentials);
    const welcome = await agent.connect({ queues: [ECHO], commands: COMMANDS });

    expect(welcome.data).to.include({ protocol: 1, agentId });
    expect(welcome.data.config.statusIntervalMs).to.be.a("number");

    const seq = agent.status({ "demo.echo": 0 });

    await agent.next("ack", m => m.data?.seq >= seq);

    const view = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}`),
      200,
    ).data;

    expect(view.status).to.equal("online");
    expect(view.transport).to.equal("ws");
    expect(view.capabilities.jobs.queues).to.deep.equal([ECHO]);
    expect(view.live.status.state).to.equal("idle");

    const list = expectStatus(
      await call(admin, "GET", "/api/v1/agents?status=online"),
      200,
    );

    expect(items(list.data).map((a: any) => a.id)).to.include(agentId);
    expectStatus(await call(alice, "GET", "/api/v1/agents"), 403);

    agent.close();
  });

  it("задачи: раздача по слотам, прогресс, свежие ссылки, итог; провал; отмена", async () => {
    const agent = new TestAgent(credentials);

    await agent.connect({ queues: [ECHO], commands: COMMANDS });
    agent.status({ "demo.echo": 1 });

    const job = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "привет",
        withOutput: true,
      }),
      201,
    );
    const assign = (
      await agent.next("job.assign", m => m.data.jobId === job.data.jobId)
    ).data;

    expect(assign.data.text).to.equal("привет");
    expect(assign.outputs.echo.url, "подписанная ссылка").to.be.a("string");
    expect(assign.outputs.echo.contentType).to.equal("text/plain");

    const ref = { jobId: assign.jobId, attempt: assign.attempt };

    agent.stream("job.accept", ref);
    agent.status({ "demo.echo": 0 }, [{ ...ref, queue: "demo.echo" }]);
    agent.stream("job.progress", {
      ...ref,
      progress: 0.5,
      text: "половина",
      log: ["работаю"],
    });

    await eventually(
      async () =>
        (await call(admin, "GET", `/api/v1/jobs/${ref.jobId}`)).data
          ?.progress === 0.5,
      { what: "прогресс задачи" },
    );

    // Свежие ссылки на выходы — запрос с ответом по `re`.
    const urlsId = agent.reliable("job.urls", { ...ref, outputs: ["echo"] });
    const urls = await agent.next("job.urls", m => m.re === urlsId);

    expect(urls.data.outputs.echo.url).to.be.a("string");

    const put = await fetch(urls.data.outputs.echo.url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "привет",
    });

    expect(put.status).to.be.oneOf([200, 201, 204]);

    // Событие с повтором (ack потерялся) — обработано один раз.
    const event = { ...ref, seq: 1, type: "step", data: { n: 1 } };

    await agent.acked(agent.reliable("job.event", event));
    await agent.acked(agent.reliable("job.event", event));

    // Клиент ждёт итога long-poll — ответ приходит в момент завершения.
    const waiting = call(
      admin,
      "GET",
      `/api/v1/jobs/${ref.jobId}?waitSeconds=20`,
    );
    const completeId = agent.reliable("job.complete", {
      ...ref,
      result: { echo: "привет" },
    });

    await agent.acked(completeId);

    const done = expectStatus(await waiting, 200).data;

    expect(done.status).to.equal("completed");
    expect(done.result.echo).to.equal("привет");

    // Повтор итога (ack потерялся, агент дослал из outbox) — без повтора, ошибка без retry.
    agent.reliable("job.complete", { ...ref, result: { echo: "again" } });

    const lost = await agent.next(
      "error",
      m => m.data.code === "JOB_LEASE_LOST",
    );

    expect(lost.data.retryable).to.equal(false);

    // Ошибка без повтора → failed
    agent.status({ "demo.echo": 1 });

    const failing = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "fail" }),
      201,
    );
    const second = (
      await agent.next("job.assign", m => m.data.jobId === failing.data.jobId)
    ).data;

    await agent.acked(
      agent.reliable("job.fail", {
        jobId: second.jobId,
        attempt: second.attempt,
        code: "BAD_INPUT",
        message: "не могу",
        retryable: false,
      }),
    );
    expect(
      (await call(admin, "GET", `/api/v1/jobs/${second.jobId}`)).data.status,
    ).to.equal("failed");

    // Отмена выполняющейся задачи доходит до агента сразу.
    agent.status({ "demo.echo": 1 });

    const cancelled = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "cancel" }),
      201,
    );
    const third = (
      await agent.next("job.assign", m => m.data.jobId === cancelled.data.jobId)
    ).data;
    const cancelStarted = Date.now();

    expectStatus(
      await call(admin, "POST", `/api/v1/jobs/${third.jobId}/cancel`),
      204,
    );
    await agent.next("job.cancel", m => m.data.jobId === third.jobId);
    expect(Date.now() - cancelStarted, "отмена пришла сразу").to.be.below(
      5_000,
    );

    // Досрочное завершение: агент получает job.stop и сдаёт то, что есть.
    agent.status({ "demo.echo": 1 });

    const stopping = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "stop" }),
      201,
    );
    const fourth = (
      await agent.next("job.assign", m => m.data.jobId === stopping.data.jobId)
    ).data;

    expectStatus(
      await call(admin, "POST", `/api/v1/jobs/${fourth.jobId}/stop`),
      204,
    );
    await agent.next("job.stop", m => m.data.jobId === fourth.jobId);
    await agent.acked(
      agent.reliable("job.complete", {
        jobId: fourth.jobId,
        attempt: fourth.attempt,
        result: { echo: "частично" },
      }),
    );

    const stopped = (await call(admin, "GET", `/api/v1/jobs/${fourth.jobId}`))
      .data;

    expect(stopped.status).to.equal("completed");
    expect(stopped.stopRequested).to.equal(true);
    expect(stopped.agentId).to.equal(agentId);
    expectStatus(
      await call(admin, "POST", `/api/v1/jobs/${fourth.jobId}/stop`),
      409,
      "JOB_NOT_CANCELLABLE",
    );

    agent.close();
  });

  it("сверка при переподключении: выданная, но не принятая задача приходит снова", async () => {
    const first = new TestAgent(credentials);

    await first.connect({ queues: [ECHO] });
    first.status({ "demo.echo": 1 });

    const job = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "resend" }),
      201,
    );

    await first.next("job.assign", m => m.data.jobId === job.data.jobId);
    first.close();
    await first.closed();

    const second = new TestAgent(credentials);

    await second.connect({ queues: [ECHO] });

    const again = (
      await second.next("job.assign", m => m.data.jobId === job.data.jobId)
    ).data;

    expect(again.attempt).to.equal(0);
    await second.acked(
      second.reliable("job.complete", {
        jobId: again.jobId,
        attempt: again.attempt,
        result: { echo: "resend" },
      }),
    );
    second.close();
  });

  it("команды: белый список агента, доставка, вывод, итог, отмена", async () => {
    const agent = new TestAgent(credentials);

    await agent.connect({ queues: [ECHO], commands: COMMANDS });

    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/commands`, {
        name: "rm -rf /",
      }),
      400,
      "AGENT_COMMAND_NOT_SUPPORTED",
    );

    const command = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/commands`, {
        name: "agent.logs",
        args: { lines: 10 },
        timeoutSec: 30,
      }),
      201,
    ).data;
    const run = await agent.next(
      "cmd.run",
      m => m.data.commandId === command.id,
    );

    expect(run.data).to.include({ name: "agent.logs", timeoutSec: 30 });
    expect(run.data.args).to.deep.equal({ lines: 10 });

    agent.stream("cmd.accept", { commandId: command.id });
    agent.stream("cmd.output", { commandId: command.id, chunk: "строка 1\n" });
    await agent.acked(
      agent.reliable("cmd.done", {
        commandId: command.id,
        ok: true,
        exitCode: 0,
        result: { lines: 1 },
      }),
    );

    const done = expectStatus(
      await call(admin, "GET", `/api/v1/agent-commands/${command.id}`),
      200,
    ).data;

    expect(done.status).to.equal("succeeded");
    expect(done.output).to.equal("строка 1\n");
    expect(done.result).to.deep.equal({ lines: 1 });

    expectStatus(
      await call(admin, "POST", `/api/v1/agent-commands/${command.id}/cancel`),
      409,
      "AGENT_COMMAND_NOT_CANCELLABLE",
    );

    const pending = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/commands`, {
        name: "agent.drain",
      }),
      201,
    ).data;

    expectStatus(
      await call(admin, "POST", `/api/v1/agent-commands/${pending.id}/cancel`),
      204,
    );

    const list = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/commands`),
      200,
    );

    expect(items(list.data).map((c: any) => c.id)).to.include.members([
      command.id,
      pending.id,
    ]);
    agent.close();
  });

  it("новая сессия вытесняет прежнюю (4410), отзыв закрывает канал (4401)", async () => {
    const first = new TestAgent(credentials);

    await first.connect({ queues: [ECHO] });

    const second = new TestAgent(credentials);

    await second.connect({ queues: [ECHO] });
    expect(await first.closed()).to.equal(4410);

    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/revoke`),
      204,
    );
    expect(await second.closed()).to.equal(4401);
    expect(
      await rejectedUpgrade({ authorization: `Agent ${credentials}` }),
    ).to.equal(401);
  });
});

describe("агенты: bootstrap-токен, HTTP sync, выпуски", () => {
  let admin: Actor;
  let agentId: string;
  let auth: { authorization: string };

  const sync = (body: unknown, headers = auth) =>
    call(null, "POST", "/api/v1/agent-link/sync", body, { headers });

  const hello = {
    type: "hello",
    data: {
      protocols: [1],
      agent: {
        name: "e2e-http",
        version: "1.0.0",
        bootId: "b00t",
        startedAt: Date.now(),
      },
      host: { hostname: "e2e", os: "linux", arch: "amd64" },
      capabilities: {
        jobs: { queues: [{ name: "demo.echo", concurrency: 1 }] },
        commands: { names: ["agent.update"] },
        update: { mode: "self" },
      },
      jobs: [],
    },
  };

  before(async () => {
    admin = await signInAdmin();

    const enrolled = expectStatus(
      await call(null, "POST", "/api/v1/agent-link/enroll", {
        token: AGENT_RELEASE.bootstrapToken,
        name: "e2e-http",
      }),
      201,
    );

    agentId = enrolled.data.agentId;
    auth = {
      authorization: `Agent ${agentId}.${enrolled.data.secret}`,
    };
  });

  // Сессия HTTP живёт на сервере и раздала бы задачи соседних наборов.
  after(async () => {
    if (agentId) await call(admin, "POST", `/api/v1/agents/${agentId}/revoke`);
  });

  it("HTTP sync: hello → welcome, ack потока, задача long-poll, итог", async () => {
    expectStatus(
      await call(null, "POST", "/api/v1/agent-link/sync", { messages: [] }),
      401,
    );
    expectStatus(
      await sync({ sessionId: null, messages: [{ type: "status", data: {} }] }),
      400,
      "AGENT_HELLO_REQUIRED",
    );

    const opened = expectStatus(
      await sync({
        sessionId: null,
        messages: [
          hello,
          {
            type: "status",
            seq: 1,
            data: { state: "idle", slots: { "demo.echo": 0 } },
          },
        ],
      }),
      200,
    ).data;
    const { sessionId } = opened;
    const types = opened.messages.map((m: any) => m.type);

    expect(types).to.include("welcome");
    expect(
      opened.messages.find((m: any) => m.type === "welcome").data,
    ).to.include({
      agentId,
      sessionId,
    });

    const job = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "http" }),
      201,
    );
    // Слот освободился — задача приходит в ответ на ожидающий обмен.
    const assigned = await eventually(
      async () => {
        const res = expectStatus(
          await sync({
            sessionId,
            waitSeconds: 2,
            messages: [
              {
                type: "status",
                seq: 2,
                data: { state: "idle", slots: { "demo.echo": 1 } },
              },
            ],
          }),
          200,
        );

        return res.data.messages.find(
          (m: any) =>
            m.type === "job.assign" && m.data.jobId === job.data.jobId,
        );
      },
      { what: "job.assign по HTTP" },
    );
    const done = expectStatus(
      await sync({
        sessionId,
        messages: [
          {
            type: "job.complete",
            id: "c-1",
            data: {
              jobId: assigned.data.jobId,
              attempt: assigned.data.attempt,
              result: { echo: "http" },
            },
          },
        ],
      }),
      200,
    ).data;

    expect(
      done.messages.some(
        (m: any) => m.type === "ack" && m.data.ids?.includes("c-1"),
      ),
    ).to.equal(true);
    expect(
      (await call(admin, "GET", `/api/v1/jobs/${job.data.jobId}`)).data.status,
    ).to.equal("completed");

    const view = (await call(admin, "GET", `/api/v1/agents/${agentId}`)).data;

    expect(view.transport).to.equal("http");
    expect(view.capabilities.jobs.queues).to.deep.equal([
      { name: "demo.echo", concurrency: 1 },
    ]);

    expectStatus(
      await sync({
        sessionId: "00000000-0000-4000-8000-000000000000",
        messages: [],
      }),
      409,
      "AGENT_SESSION_REPLACED",
    );
  });

  it("выпуски: список, обновление подписанной сборкой, загрузка агентом", async () => {
    const releases = expectStatus(
      await call(admin, "GET", "/api/v1/agent-releases"),
      200,
    ).data;

    expect(releases[0].version).to.equal(AGENT_RELEASE.version);

    const command = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/update`, {}),
      201,
    ).data;

    expect(command.name).to.equal("agent.update");
    expect(command.args.version).to.equal(AGENT_RELEASE.version);
    expect(command.args.url).to.equal(
      `/api/v1/agent-link/releases/${AGENT_RELEASE.version}/linux/amd64`,
    );
    expect(
      verify(
        null,
        Buffer.from(command.args.sha256),
        AGENT_RELEASE.publicKey!,
        Buffer.from(command.args.signature, "base64"),
      ),
      "подпись выпуска проверяется ключом стенда",
    ).to.equal(true);

    const download = await fetch(BASE_URL + command.args.url, {
      headers: auth,
    });

    expect(download.status).to.equal(200);
    expect(
      createHash("sha256")
        .update(Buffer.from(await download.arrayBuffer()))
        .digest("hex"),
    ).to.equal(command.args.sha256);
    calledEndpoints.push({ method: "GET", path: command.args.url });

    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/update`, {
        version: "9.9.9",
      }),
      404,
      "AGENT_RELEASE_NOT_FOUND",
    );
    expect(
      (await fetch(BASE_URL + command.args.url)).status,
      "без учётных данных агента сборка не отдаётся",
    ).to.equal(401);
  });
});
