import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

import { enroll, RealAgent } from "./agent";
import {
  Actor,
  call,
  eventually,
  expectStatus,
  items,
  signIn,
  signInAdmin,
  signUp,
} from "./client";
import {
  AGENT_BOOTSTRAP_TOKEN,
  AGENT_VERSION,
  BASE_URL,
  readStored,
  startPeerServer,
} from "./harness";
import { connectSocket, TestSocket } from "./socket";

const SETTLED = ["completed", "failed", "cancelled"];

describe("агенты (настоящий агент и воркер echo)", function () {
  this.timeout(120_000);

  let admin: Actor;
  let bob: Actor;
  let socket: TestSocket;
  let agent: RealAgent;
  let agentId: string;

  const getAgent = async () =>
    expectStatus(await call(admin, "GET", `/api/v1/agents/${agentId}`), 200)
      .data;
  const worker = (a: any, name: string) =>
    a.workers.find((w: any) => w.name === name);
  /** Команда воркеру echo; по умолчанию — с ожиданием итога. */
  const command = (body: object, who: Actor = admin) =>
    call(who, "POST", `/api/v1/agents/${agentId}/workers/echo/commands`, {
      waitSeconds: 10,
      ...body,
    });
  const feed = async (query: string) =>
    items(
      expectStatus(
        await call(
          admin,
          "GET",
          `/api/v1/agents/events?agentId=${agentId}&${query}`,
        ),
        200,
      ).data,
    );
  const jobSettled = (jobId: string, timeoutMs = 20_000) =>
    eventually(
      async () => {
        const job = (await call(admin, "GET", `/api/v1/jobs/${jobId}`)).data;

        return SETTLED.includes(job?.status) && job;
      },
      { what: `итог задачи ${jobId}`, timeoutMs },
    );

  before(async () => {
    admin = await signInAdmin();
    bob = await signUp("a-bob");
    socket = await connectSocket(admin);
  });

  after(async () => {
    socket?.close();
    await agent?.stop();
  });

  it("токены регистрации: создание, список без секрета, лимит, отзыв; неверный — 401", async () => {
    const created = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment/tokens", {
        name: "e2e",
        labels: { zone: "e2e" },
        maxUses: 1,
      }),
      201,
    );
    const { token, enrollmentToken } = created.data;

    expect(token).to.match(/^[\w-]{8}\.[\w-]+$/);

    // Срок — ISO-строка с миллисекундами, как шлёт веб (Date.toISOString()).
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const dated = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment/tokens", {
        name: "e2e-dated",
        maxUses: 1,
        expiresAt,
      }),
      201,
    ).data.enrollmentToken;

    expect(new Date(dated.expiresAt).toISOString()).to.equal(expiresAt);

    const list = expectStatus(
      await call(admin, "GET", "/api/v1/agent-enrollment/tokens?limit=10"),
      200,
    );

    expect(items(list.data).map((t: any) => t.id)).to.include(
      enrollmentToken.id,
    );
    expect(JSON.stringify(list.data)).to.not.include(token.split(".")[1]);
    expectStatus(
      await call(bob, "GET", "/api/v1/agent-enrollment/tokens"),
      403,
    );

    const first = await enroll(token, "e2e-token");

    expect(first.status).to.equal(200);
    expect(first.agentId).to.match(/^[0-9a-f]{32}$/);
    expect(first.secret).to.be.a("string");
    expect((await enroll(token, "e2e-token-2")).status, "лимит").to.equal(401);
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agent-enrollment/tokens/${enrollmentToken.id}/revoke`,
      ),
      204,
    );
    expect((await enroll("bad.token", "x")).status).to.equal(401);

    // Ключ агента: вход по нему; неизвестный — 401 AGENT_UNKNOWN.
    const hello = (auth: string) =>
      fetch(`${BASE_URL}/agent/v1/hello`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify({
          agent: { version: AGENT_VERSION, bootId: "b", startedAt: Date.now() },
          host: { os: "linux", arch: "amd64", hostname: "e2e" },
          name: "e2e-token",
          labels: { own: "1" },
          workers: [],
        }),
      });

    expect(
      (await hello(`Agent ${first.agentId}.${first.secret}`)).status,
    ).to.equal(200);

    const unknown = await hello(`Agent ${first.agentId}.wrong`);

    expect(unknown.status).to.equal(401);
    expect(((await unknown.json()) as any).code).to.equal("AGENT_UNKNOWN");

    const card = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${first.agentId}`),
      200,
    ).data;

    // Метки токена агент не перепишет: они поверх своих.
    expect(card.labels).to.include({ zone: "e2e", own: "1" });
    expectStatus(
      await call(admin, "DELETE", `/api/v1/agents/${first.agentId}`),
      204,
    );
  });

  it("без права agent:view — 403, чужой агент — 404, нет комнаты агентов", async () => {
    expectStatus(await call(bob, "GET", "/api/v1/agents"), 403);
    expectStatus(
      await call(bob, "GET", `/api/v1/agents/${"0".repeat(32)}`),
      404,
    );
    expectStatus(await call(admin, "GET", "/api/v1/agents/not-an-id"), 400);

    const bobSocket = await connectSocket(bob);

    expect((await bobSocket.join("agents")).ok).to.equal(false);
    bobSocket.close();
  });

  it("регистрация и связь: агент на связи, воркер зарегистрирован, манифест, комната agents", async () => {
    expect((await socket.join("agents")).ok).to.equal(true);

    const online = socket.next(
      "agent:updated",
      (a: any) => a.name === "e2e-agent" && a.online,
      20_000,
    );

    agent = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-agent",
    });
    agentId = agent.agentId;
    await online;

    const card = await eventually(
      async () => {
        const a = await getAgent();

        return worker(a, "echo")?.state === "running" && a.metrics && a;
      },
      { what: "воркер echo зарегистрирован", timeoutMs: 20_000 },
    );

    expect(card).to.include({
      online: true,
      revoked: false,
      version: AGENT_VERSION,
      updateMode: "disabled",
    });
    expect(card.host.os).to.be.a("string");
    expect(card.remoteIp).to.equal("127.0.0.1");
    expect(card.alerts).to.deep.equal([]);

    const echo = worker(card, "echo");

    expect(echo).to.include({
      release: false,
      version: readFileSync("agent/workers/echo/VERSION", "utf8").trim(),
    });
    expect(echo.health.ok).to.equal(true);

    // Манифест: команды, события, запросы к бэкенду, ключи настроек — со схемами.
    const say = echo.manifest.commands.find((c: any) => c.type === "echo.say");

    expect(say.schema.required).to.deep.equal(["text"]);
    expect(say.result).to.be.an("object");
    expect(echo.manifest.commands.map((c: any) => c.type)).to.have.members([
      "echo.say",
      "echo.quick",
      "echo.long",
      "echo.hang",
      "echo.emit",
    ]);
    expect(
      echo.manifest.events.find((e: any) => e.type === "echo.echoed").schema
        .required,
    ).to.deep.equal(["text", "length"]);
    expect(echo.manifest.requests.map((r: any) => r.type)).to.deep.equal([
      "echo.lookup",
    ]);
    expect(echo.manifest.configs.map((c: any) => c.key)).to.deep.equal([
      "settings",
    ]);

    const list = expectStatus(await call(admin, "GET", "/api/v1/agents"), 200);

    expect(items(list.data).map((a: any) => a.id)).to.include(agentId);
  });

  it("настройка воркера: проверка по схеме, применение, статус и событие сокета", async () => {
    expect((await socket.join("agent", agentId)).ok).to.equal(true);

    const applied = socket.next(
      "agent:config",
      (s: any) => s.key === "settings" && s.state === "applied",
      15_000,
    );
    const path = `/api/v1/agents/${agentId}/workers/echo/configs/settings`;
    const invalid = expectStatus(
      await call(admin, "PUT", path, { prefix: 5 }),
      400,
      "AGENT_CONFIG_INVALID",
    );

    expect(JSON.stringify(invalid.data)).to.include("prefix");
    expectStatus(
      await call(
        admin,
        "PUT",
        `/api/v1/agents/${agentId}/workers/echo/configs/nope`,
        {},
      ),
      422,
      "AGENT_CONFIG_UNDECLARED",
    );

    const set = expectStatus(
      await call(admin, "PUT", path, { prefix: "> ", upper: true }),
      200,
    ).data;

    expect(set).to.include({
      worker: "echo",
      key: "settings",
      actor: admin.id,
    });
    expect((await applied).version).to.equal(set.version);

    const all = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/configs`),
      200,
    ).data;
    const settings = all.find((c: any) => c.key === "settings");

    expect(settings).to.include({ state: "applied", version: set.version });
    expect(settings.data).to.deep.equal({ prefix: "> ", upper: true });
    await eventually(
      async () => {
        const a = await getAgent();

        return a.appliedRev === a.desiredRev;
      },
      { what: "агент применил желаемое" },
    );
  });

  it("настройки без права agent:config: статус и версия видны, значение — нет", async () => {
    const created = await signUp("a-config-viewer");

    expectStatus(
      await call(admin, "PATCH", `/api/v1/user/setPrivileges/${created.id}`, {
        roles: ["user"],
        permissions: ["agent:view"],
      }),
      200,
    );

    const viewer = await signIn(created.email, created.password);
    const settings = expectStatus(
      await call(viewer, "GET", `/api/v1/agents/${agentId}/configs`),
      200,
    ).data.find((c: any) => c.worker === "echo" && c.key === "settings");

    expect(settings.state).to.equal("applied");
    expect(settings.version).to.be.a("number");
    expect(settings).to.not.have.property("data");
    expectStatus(
      await call(
        viewer,
        "PUT",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
        {},
      ),
      403,
    );
    expectStatus(
      await command({ type: "echo.say", args: { text: "x" } }, viewer),
      403,
    );
  });

  it("команда воркеру: итог с ожиданием, проверка по схеме, необъявленная — 422, чужой агент — 404", async () => {
    const said = expectStatus(
      await command({ type: "echo.say", args: { text: "привет" } }),
      200,
    ).data;

    expect(said).to.include({
      type: "worker.command",
      worker: "echo",
      workerType: "echo.say",
      status: "done",
      ok: true,
      actor: admin.id,
    });
    expect(said.result).to.deep.equal({ text: "> ПРИВЕТ" });

    const shaped = expectStatus(
      await command({
        type: "echo.say",
        args: { text: "аб", repeat: 2, case: "lower", reverse: true },
      }),
      200,
    ).data;

    expect(shaped.result).to.deep.equal({ text: "> ба ба" });

    const invalid = expectStatus(
      await command({ type: "echo.say", args: { text: 5, extra: true } }),
      400,
      "AGENT_COMMAND_INVALID",
    );

    expect(JSON.stringify(invalid.data)).to.include("text");
    expectStatus(
      await command({ type: "echo.nope" }),
      422,
      "AGENT_COMMAND_UNDECLARED",
    );
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/none/commands`,
        {
          type: "echo.say",
        },
      ),
      404,
      "AGENT_WORKER_NOT_FOUND",
    );
    expectStatus(
      await command({ type: "echo.say", args: { text: "x" } }, bob),
      404,
    );

    // Без ожидания — поставленная команда; итог — по id и в сокете.
    const finished = socket.next(
      "agent:command",
      (c: any) => c.workerType === "echo.say" && c.status === "done",
      15_000,
    );
    const queued = expectStatus(
      await command({
        type: "echo.say",
        args: { text: "позже" },
        waitSeconds: 0,
      }),
      200,
    ).data;

    expect(queued.status).to.equal("pending");
    expect((await finished).id).to.equal(queued.id);

    const one = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${queued.id}?waitSeconds=5`,
      ),
      200,
    ).data;

    expect(one.result).to.deep.equal({ text: "> ПОЗЖЕ" });

    const recent = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/commands?limit=5`),
      200,
    ).data;

    expect(recent[0].id).to.equal(queued.id);
    expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/commands/nope`),
      404,
      "AGENT_COMMAND_NOT_FOUND",
    );
  });

  it("события: data не по схеме — в истории с замечаниями, необъявленный тип агент не принимает", async () => {
    const marker = `метка-${Date.now()}`;
    const emitted = expectStatus(
      await command({
        type: "echo.emit",
        args: { type: "echo.echoed", data: { text: marker, length: "x" } },
      }),
      200,
    ).data;

    expect(emitted.ok, JSON.stringify(emitted.error)).to.equal(true);

    const undeclared = expectStatus(
      await command({ type: "echo.emit", args: { type: "echo.nope" } }),
      200,
    ).data;

    expect(undeclared.ok).to.equal(false);
    expect(undeclared.error.code).to.equal("EVENT_UNDECLARED");

    const stored = await eventually(
      async () =>
        (await feed("type=echo.echoed&limit=50")).find(
          (e: any) => e.data?.text === marker,
        ),
      { what: "событие не по схеме — в истории" },
    );

    expect(stored.problems.join(" ")).to.include("length");

    // echo.say — событие echo.echoed по схеме, без замечаний.
    await command({ type: "echo.say", args: { text: marker } });

    const valid = await eventually(
      async () =>
        (await feed("type=echo.echoed&limit=50")).find(
          (e: any) => e.data?.text === `> ${marker.toUpperCase()}`,
        ),
      { what: "событие по схеме" },
    );

    expect(valid).to.not.have.property("problems");
  });

  it("комната агента: метрики чаще и журнал (watch), уровень журнала", async () => {
    const points: number[] = [];
    const onMetrics = (m: any) => {
      if (m.agentId === agentId) points.push(m.point.at);
    };

    socket.socket.on("agent:metrics", onMetrics);

    const log = socket.next(
      "agent:log",
      (l: any) => l.agentId === agentId && l.entries.length > 0,
      20_000,
    );

    await eventually(async () => points.length >= 3, {
      what: "метрики по наблюдению",
      timeoutMs: 20_000,
    });
    socket.socket.off("agent:metrics", onMetrics);
    await command({ type: "echo.say", args: { text: "в журнал" } });
    await log;

    const ack = await new Promise<any>(resolve =>
      socket.socket.emit(
        "agent:log-level",
        { agentId, level: "debug" },
        resolve,
      ),
    );

    expect(ack.ok).to.equal(true);

    const point = (await getAgent()).metrics;

    expect(point.host).to.be.an("object");
    expect(point.workers.echo).to.include.keys("said", "events");
  });

  it("очередь demo.echo, быстрая задача echo.quick: итог из итога команды", async () => {
    const started = Date.now();
    const created = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "быстро" }),
      201,
    ).data;
    const job = await jobSettled(created.jobId);

    expect(Date.now() - started).to.be.below(5_000);
    expect(job).to.include({
      status: "completed",
      agentId,
      worker: "echo",
      jobType: "echo.quick",
      outputs: null,
    });
    expect(job.result).to.deep.equal({ text: "> БЫСТРО" });
  });

  it("запрос воркера к серверу: echo.quick с lookup — префикс от обработчика echo.lookup; отказ — провал без повторов", async () => {
    const created = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "запрос",
        lookup: true,
      }),
      201,
    ).data;
    const job = await jobSettled(created.jobId);

    expect(job.status, JSON.stringify(job.error)).to.equal("completed");
    expect(job.result).to.deep.equal({
      text: "[e2e-agent] > ЗАПРОС",
      prefix: "[e2e-agent] ",
    });

    const refused = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "x".repeat(201),
        lookup: true,
      }),
      201,
    ).data;
    const failed = await jobSettled(refused.jobId);

    expect(failed.status).to.equal("failed");
    expect(JSON.stringify(failed.error)).to.include("ECHO_TEXT_TOO_LONG");
  });

  it("очередь demo.echo, долгая задача echo.long: ход, итог, файл итога — ссылка на скачивание", async () => {
    const progress = socket.next(
      "agent:command",
      (c: any) => c.workerType === "echo.long" && c.progress > 0,
      15_000,
    );
    const started = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "задача",
        long: true,
        steps: 3,
        delayMs: 200,
        withOutput: true,
      }),
      201,
    ).data;
    const job = await jobSettled(started.jobId);

    expect(job.status, JSON.stringify(job.error)).to.equal("completed");
    expect(job).to.include({
      agentId,
      worker: "echo",
      jobType: "echo.long",
      progress: 1,
    });
    expect(job.result).to.deep.equal({ text: "> ЗАДАЧА", output: "result" });
    expect((await progress).args.args.jobId).to.equal(started.jobId);
    expect(await readStored(`jobs/${started.jobId}/echo.txt`)).to.equal(
      "> ЗАДАЧА",
    );

    expect(job.outputs).to.have.length(1);

    const [output] = job.outputs;

    expect(output).to.include({
      name: "result",
      size: Buffer.byteLength("> ЗАДАЧА"),
    });

    const download = await fetch(output.url);

    expect(download.status).to.equal(200);
    expect(await download.text()).to.equal("> ЗАДАЧА");

    // Ход — события command.progress в ленте; лента постранично.
    expect(
      (await feed("worker=echo&type=command.progress&limit=10")).length,
    ).to.be.above(0);

    const page = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/events?agentId=${agentId}&limit=2`,
      ),
      200,
    ).data;

    expect(page.items).to.have.length(2);
    expect(page.nextCursor).to.be.a("string");
    expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/events?agentId=${agentId}&limit=2&cursor=${page.nextCursor}`,
      ),
      200,
    );
  });

  it("очередь demo.echo: отмена уходит воркеру, провал задачи — failed", async () => {
    const long = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "долго",
        long: true,
        steps: 50,
        delayMs: 300,
      }),
      201,
    ).data;

    await eventually(
      async () =>
        (await call(admin, "GET", `/api/v1/jobs/${long.jobId}`)).data
          ?.progress > 0,
      { what: "задача идёт" },
    );
    expectStatus(
      await call(admin, "POST", `/api/v1/jobs/${long.jobId}/cancel`),
      204,
    );
    expect((await jobSettled(long.jobId)).status).to.equal("cancelled");

    const failing = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "сбой",
        long: true,
        steps: 1,
        delayMs: 50,
        fail: true,
      }),
      201,
    ).data;
    const failed = await jobSettled(failing.jobId);

    expect(failed.status).to.equal("failed");
    expect(failed.error.code).to.equal("ECHO_FAILED");
  });

  it("отмена команды воркера по id: итог CANCELLED", async () => {
    const queued = expectStatus(
      await command({
        type: "echo.long",
        args: { steps: 50, delayMs: 300 },
        waitSeconds: 0,
      }),
      200,
    ).data;

    await eventually(
      async () =>
        (
          await call(
            admin,
            "GET",
            `/api/v1/agents/${agentId}/commands/${queued.id}`,
          )
        ).data?.progress > 0,
      { what: "команда идёт" },
    );
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/commands/${queued.id}/cancel`,
      ),
      200,
    );

    const done = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${queued.id}?waitSeconds=10`,
      ),
      200,
    ).data;

    expect(done).to.include({ status: "done", ok: false });
    expect(done.error.code).to.equal("CANCELLED");
  });

  it("вторая копия API без потока агента: чтение и команды — через общую БД", async () => {
    const peer = await startPeerServer();

    try {
      const via = { baseUrl: peer.url };
      const card = expectStatus(
        await call(admin, "GET", `/api/v1/agents/${agentId}`, undefined, via),
        200,
      ).data;

      expect(card.online).to.equal(true);

      const said = expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/agents/${agentId}/workers/echo/commands`,
          { type: "echo.say", args: { text: "через копию" }, waitSeconds: 10 },
          via,
        ),
        200,
      ).data;

      expect(said.result).to.deep.equal({ text: "> ЧЕРЕЗ КОПИЮ" });

      const logs = expectStatus(
        await call(
          admin,
          "GET",
          `/api/v1/agents/${agentId}/logs?worker=echo&lines=5`,
          undefined,
          via,
        ),
        200,
      ).data;

      expect(logs.entries).to.be.an("array");
    } finally {
      await peer.stop();
    }
  });

  it("история метрик и журнал с узла", async () => {
    const history = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/metrics?limit=5`),
      200,
    ).data;

    expect(history).to.have.length.within(1, 5);
    expect(history[0].at).to.be.at.most(history.at(-1).at);
    expect(history.at(-1).host).to.be.an("object");

    const logs = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/logs?worker=echo&lines=50`,
      ),
      200,
    ).data;

    expect(logs.entries.map((e: any) => e.msg).join("\n")).to.include(
      "настройки применены",
    );
  });

  it("перезапуск занятого воркера ждёт окончания работы; с force — сразу", async () => {
    const long = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "работа",
        long: true,
        steps: 15,
        delayMs: 400,
      }),
      201,
    ).data;

    await eventually(
      async () => worker(await getAgent(), "echo").health?.busy === true,
      { what: "воркер занят (health.busy)", timeoutMs: 20_000 },
    );

    const deferred = expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/restart`,
        {},
      ),
      200,
    ).data;

    expect(deferred).to.include({ type: "worker.restart", status: "pending" });
    expect((await jobSettled(long.jobId, 30_000)).status).to.equal("completed");

    const restarted = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${deferred.id}?waitSeconds=30`,
      ),
      200,
    ).data;

    expect(restarted.ok, JSON.stringify(restarted.error)).to.equal(true);

    const before = (await feed("type=echo.started")).length;
    const forced = expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/restart`,
        { force: true },
      ),
      200,
    ).data;

    expect(
      (
        await call(
          admin,
          "GET",
          `/api/v1/agents/${agentId}/commands/${forced.id}?waitSeconds=30`,
        )
      ).data.ok,
    ).to.equal(true);
    await eventually(
      async () => (await feed("type=echo.started")).length > before,
      { what: "воркер запущен заново", timeoutMs: 20_000 },
    );
  });

  it("обновление воркера из папки — 409; обновление агента без новой версии — 409, с версией — отказ агента", async () => {
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/update`,
        {},
      ),
      409,
      "AGENT_WORKER_NOT_RELEASED",
    );
    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/update`, {}),
      409,
      "AGENT_UPDATE_NOT_AVAILABLE",
    );

    const queued = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/update`, {
        version: "9.9.9",
      }),
      200,
    ).data;
    const done = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${queued.id}?waitSeconds=15`,
      ),
      200,
    ).data;

    expect(done.ok).to.equal(false);
    expect(done.error.code).to.equal("UPDATE_NOT_SUPPORTED");
  });

  it("команда установки, install.sh", async () => {
    const install = (body: object) =>
      call(admin, "POST", "/api/v1/agent-enrollment/install-command", body);
    const bundle = `'${BASE_URL}/agent/v1/bundle/agent.tar.gz'`;
    const prefix = `curl -fsSL '${BASE_URL}/agent/v1/bundle/install.sh' |`;

    expect(
      expectStatus(await install({ token: "tok.secret" }), 200).data.command,
    ).to.equal(
      `${prefix} sudo sh -s -- --server '${BASE_URL}' --bundle ${bundle} --token 'tok.secret'`,
    );
    expectStatus(await install({}), 400);
    // Без root и без установки (контейнер) — без sudo; неизвестный способ — ошибка.
    expect(
      expectStatus(
        await install({ token: "tok.secret", mode: "rootless" }),
        200,
      ).data.command,
    ).to.equal(
      `${prefix} sh -s -- --server '${BASE_URL}' --bundle ${bundle} --token 'tok.secret' --rootless`,
    );
    expect(
      expectStatus(await install({ token: "tok.secret", mode: "run" }), 200)
        .data.command,
    ).to.equal(
      `${prefix} sh -s -- --server '${BASE_URL}' --bundle ${bundle} --token 'tok.secret' --run`,
    );
    expectStatus(await install({ token: "tok.secret", mode: "podman" }), 400);

    const script = await fetch(`${BASE_URL}/agent/v1/bundle/install.sh`);

    expect(script.status).to.equal(200);
    expect(await script.text()).to.include("--bundle URL");
  });

  it("аудит: действия над агентом и их итоги — от имени пользователя", async () => {
    const actions = items(
      expectStatus(
        await call(admin, "GET", "/api/v1/audit?type=agent.action&limit=100"),
        200,
      ).data,
    )
      .filter((e: any) => e.actorId === admin.id)
      .map((e: any) => e.meta.action);

    expect(actions).to.include.members([
      "config.set",
      "worker.command",
      "worker.restart",
    ]);

    const results = items(
      expectStatus(
        await call(
          admin,
          "GET",
          "/api/v1/audit?type=agent.action-result&limit=100",
        ),
        200,
      ).data,
    );

    expect(results.map((e: any) => e.meta.action)).to.include.members([
      "worker.restart",
      "worker.command",
    ]);
  });

  it("смена ключа: агент переходит на новый секрет; удаление ключа настроек", async () => {
    const rotated = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/rotate-key`),
      200,
    ).data;
    const done = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${rotated.id}?waitSeconds=15`,
      ),
      200,
    ).data;

    expect(done.ok, JSON.stringify(done.error)).to.equal(true);
    expect(done.result.secretHash).to.match(/^[0-9a-f]{64}$/);

    // Агент на связи с новым ключом: команда проходит.
    await eventually(
      async () =>
        (await command({ type: "echo.say", args: { text: "ключ" } })).data
          ?.ok === true,
      { what: "связь с новым ключом", timeoutMs: 20_000 },
    );

    const removed = socket.next(
      "agent:config",
      (c: any) => c.key === "settings" && c.deleted,
      15_000,
    );

    expectStatus(
      await call(
        admin,
        "DELETE",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
      ),
      204,
    );
    await removed;
    expect(
      (await command({ type: "echo.say", args: { text: "без префикса" } })).data
        .result,
    ).to.deep.equal({ text: "БЕЗ ПРЕФИКСА" });
  });

  it("агент остановлен — online: false в сокете быстро", async () => {
    const other = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-offline",
      workers: [],
    });
    const otherId = other.agentId;

    try {
      await eventually(
        async () =>
          (await call(admin, "GET", `/api/v1/agents/${otherId}`)).data?.online,
        { what: "второй агент на связи", timeoutMs: 20_000 },
      );

      const offline = socket.next(
        "agent:updated",
        (a: any) => a.id === otherId && a.online === false,
        10_000,
      );
      const stopped = Date.now();

      await other.stop();
      await offline;
      expect(Date.now() - stopped).to.be.below(5_500);
    } finally {
      await other.stop();
      await call(admin, "DELETE", `/api/v1/agents/${otherId}`);
    }
  });

  it("удаление агента: запись удаляется, агент отозван — воркеры остановлены, ключ — 403", async () => {
    const other = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-delete",
    });
    const otherId = other.agentId;

    try {
      await eventually(
        async () => {
          const a = (await call(admin, "GET", `/api/v1/agents/${otherId}`))
            .data;

          return a?.online && worker(a, "echo")?.state === "running";
        },
        { what: "агент и воркер на связи", timeoutMs: 20_000 },
      );
      expect((await other.status())?.status).to.equal("active");

      const deleted = socket.next(
        "agent:deleted",
        (a: any) => a.id === otherId,
      );

      expectStatus(
        await call(admin, "DELETE", `/api/v1/agents/${otherId}`),
        204,
      );
      await deleted;
      expectStatus(await call(admin, "GET", `/api/v1/agents/${otherId}`), 404);
      expect(
        items(
          expectStatus(await call(admin, "GET", "/api/v1/agents"), 200).data,
        ).map((a: any) => a.id),
      ).to.not.include(otherId);

      // Агент получил 403: отозван, воркеры остановлены.
      const revoked = await eventually(
        async () => {
          const st = await other.status();

          return st?.status === "revoked" &&
            !st.workers?.some(w => w.state === "running")
            ? st
            : null;
        },
        { what: "агент отозван, воркеры остановлены", timeoutMs: 20_000 },
      );

      expect(revoked.status).to.equal("revoked");

      // Ключ удалённого агента не принимается: 403, а не регистрация заново.
      const { secret } = JSON.parse(
        readFileSync(join(other.dataDir, "credentials.json"), "utf8"),
      ) as { secret: string };
      const hello = await fetch(`${BASE_URL}/agent/v1/hello`, {
        method: "POST",
        headers: {
          authorization: `Agent ${otherId}.${secret}`,
          "content-type": "application/json",
        },
        body: "{}",
      });

      expect(hello.status).to.equal(403);
      expect(((await hello.json()) as any).code).to.equal("AGENT_REVOKED");
    } finally {
      await other.stop();
    }
  });

  it("отзыв закрывает связь, удаление убирает запись", async () => {
    const revoked = expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/revoke`),
      200,
    ).data;

    expect(revoked.revoked).to.equal(true);
    await eventually(async () => !(await getAgent()).online, {
      what: "агент без связи",
      timeoutMs: 20_000,
    });
    expectStatus(
      await command({ type: "echo.say", args: { text: "x" } }),
      409,
      "AGENT_REVOKED",
    );
    await agent.stop();

    const deleted = socket.next("agent:deleted", (a: any) => a.id === agentId);

    expectStatus(await call(admin, "DELETE", `/api/v1/agents/${agentId}`), 204);
    await deleted;
    expectStatus(await call(admin, "GET", `/api/v1/agents/${agentId}`), 404);
  });
});
