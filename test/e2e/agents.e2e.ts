import { expect } from "chai";

import { enroll, RealAgent } from "./agent";
import {
  Actor,
  call,
  eventually,
  expectStatus,
  items,
  signInAdmin,
  signUp,
} from "./client";
import {
  AGENT_BOOTSTRAP_TOKEN,
  AGENT_VERSION,
  BASE_URL,
  readStored,
  RELAY_URL,
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
  const fetchWorker = (body: object, who: Actor = admin) =>
    call(who, "POST", `/api/v1/agents/${agentId}/workers/echo/fetch`, body);
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

  it("токены регистрации: выпуск, список без секрета, лимит, отзыв; неверный — 401", async () => {
    const created = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment-tokens", {
        name: "e2e",
        labels: { zone: "e2e" },
        maxUses: 1,
      }),
      201,
    );
    const { token, enrollmentToken } = created.data;

    expect(token).to.match(/^[\w-]{8}\.[\w-]+$/);

    const list = expectStatus(
      await call(admin, "GET", "/api/v1/agent-enrollment-tokens?limit=10"),
      200,
    );

    expect(items(list.data).map((t: any) => t.id)).to.include(
      enrollmentToken.id,
    );
    expect(JSON.stringify(list.data)).to.not.include(token.split(".")[1]);

    const first = await enroll(token, "e2e-token");

    expect(first.status).to.equal(200);
    expect(first.agentId).to.match(/^[0-9a-f]{32}$/);
    expect((await enroll(token, "e2e-token-2")).status, "лимит").to.equal(401);
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agent-enrollment-tokens/${enrollmentToken.id}/revoke`,
      ),
      204,
    );
    expect((await enroll("bad.token", "x")).status).to.equal(401);

    const labelled = await eventually(
      async () =>
        (await call(admin, "GET", `/api/v1/agents/${first.agentId}`)).data,
      { what: "агент по токену" },
    );

    expect(labelled.labels).to.include({ zone: "e2e" });
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

  it("регистрация и связь: агент на связи, воркеры зарегистрированы, манифест, комната agents", async () => {
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

        return worker(a, "echo")?.state === "running" && a;
      },
      { what: "воркер echo зарегистрирован", timeoutMs: 20_000 },
    );

    expect(card).to.include({
      online: true,
      revoked: false,
      version: AGENT_VERSION,
    });
    expect(card.host.os).to.be.a("string");
    expect(worker(card, "sysmetrics")).to.include({ builtin: true });

    const echo = worker(card, "echo");

    expect(echo.health.ok).to.equal(true);
    expect(echo.manifest.version).to.equal("1.1.0");

    // Каталог возможностей: маршруты, события, запросы к серверу — со схемами.
    const route = echo.manifest.routes.find((r: any) => r.path === "/echo");

    expect(route).to.include({
      method: "POST",
      description: "Текст с префиксом",
    });
    expect(route.request.required).to.deep.equal(["text"]);
    expect(route.response).to.be.an("object");
    expect(
      echo.manifest.events.find((e: any) => e.type === "echo.echoed").schema
        .required,
    ).to.deep.equal(["text", "length"]);
    expect(echo.manifest.requests.map((r: any) => r.type)).to.deep.equal([
      "echo.lookup",
    ]);
    expect(echo.manifest.jobs.map((j: any) => j.type)).to.deep.equal([
      "echo.quick",
      "echo.long",
    ]);
    expect(echo.manifest.configs.map((c: any) => c.key)).to.deep.equal([
      "settings",
    ]);

    const list = expectStatus(await call(admin, "GET", "/api/v1/agents"), 200);

    expect(items(list.data).map((a: any) => a.id)).to.include(agentId);
  });

  it("настройка воркера: проверка по схеме, применение (applied), статус и событие сокета", async () => {
    expect((await socket.join("agent", agentId)).ok).to.equal(true);

    const applied = socket.next(
      "agent:config",
      (s: any) => s.key === "settings" && s.state === "applied",
      15_000,
    );

    expectStatus(
      await call(
        admin,
        "PUT",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
        { data: { prefix: 5 } },
      ),
      400,
      "AGENT_CONFIG_INVALID",
    );

    const set = expectStatus(
      await call(
        admin,
        "PUT",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
        { data: { prefix: "> ", upper: true } },
      ),
      200,
    ).data;

    expect(set.config).to.include({ worker: "echo", key: "settings" });
    expect(set.config.actor).to.equal(admin.id);
    expect((await applied).applied).to.equal(set.config.version);

    const one = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
      ),
      200,
    ).data;

    expect(one.status).to.include({ state: "applied" });
    expect(one.config.data).to.deep.equal({ prefix: "> ", upper: true });

    const all = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${agentId}/configs`),
      200,
    ).data;

    expect(all.map((c: any) => `${c.worker}/${c.key}`)).to.include(
      "echo/settings",
    );
  });

  it("запрос к воркеру: ответ, поток, двоичное тело, служебный путь — 403, необъявленный маршрут — 404", async () => {
    const echo = await fetchWorker({
      method: "POST",
      path: "/echo",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "привет" }),
    });

    expect(echo.status).to.equal(200);
    expect(echo.headers.get("content-type")).to.include("application/json");
    expect(echo.headers.get("x-agent-worker-status")).to.equal("200");
    expect(echo.data).to.deep.equal({ text: "> ПРИВЕТ" });

    const stream = await fetchWorker({ path: "/stream?n=3" });

    expect(stream.data).to.equal(
      "> СТРОКА 1 ИЗ 3\n> СТРОКА 2 ИЗ 3\n> СТРОКА 3 ИЗ 3\n",
    );

    const bytes = await fetch(
      `${BASE_URL}/api/v1/agents/${agentId}/workers/echo/fetch`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${admin.access}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ path: "/bytes?n=300" }),
      },
    );
    const body = new Uint8Array(await bytes.arrayBuffer());

    expect(body.length).to.equal(300);
    expect(body[299]).to.equal(299 % 256);

    // Ошибка API — без заголовка статуса воркера; ответ воркера с ошибкой — с ним.
    const forbidden = expectStatus(
      await fetchWorker({ path: "/health" }),
      403,
      "PATH_FORBIDDEN",
    );

    expect(forbidden.headers.get("x-agent-worker-status")).to.equal(null);
    // Маршрута нет в манифесте — агент не передаёт запрос воркеру.
    expect(
      expectStatus(
        await fetchWorker({ path: "/nope" }),
        404,
        "AGENT_ROUTE_UNDECLARED",
      ).headers.get("x-agent-worker-status"),
    ).to.equal(null);
    expectStatus(
      await fetchWorker({ method: "GET", path: "/echo" }),
      404,
      "AGENT_ROUTE_UNDECLARED",
    );
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/none/fetch`,
        {
          path: "/x",
        },
      ),
      404,
    );
    expectStatus(await fetchWorker({ path: "/echo" }, bob), 404);
  });

  it("строгость манифеста: тело по схеме маршрута, тип задачи из manifest.jobs", async () => {
    const invalid = expectStatus(
      await fetchWorker({
        method: "POST",
        path: "/echo",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: 5, extra: true }),
      }),
      400,
      "AGENT_REQUEST_INVALID",
    );

    expect(invalid.data.details.reason).to.include("text");
    expectStatus(
      await fetchWorker({ method: "POST", path: "/echo", body: "не JSON" }),
      400,
      "AGENT_REQUEST_INVALID",
    );

    const shaped = expectStatus(
      await fetchWorker({
        method: "POST",
        path: "/echo",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "аб",
          repeat: 2,
          case: "lower",
          reverse: true,
        }),
      }),
      200,
    ).data;

    expect(shaped).to.deep.equal({ text: "> ба ба" });
    expectStatus(
      await fetchWorker({
        method: "POST",
        path: "/jobs",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "echo.unknown", jobId: "x", data: {} }),
      }),
      409,
      "AGENT_JOB_UNKNOWN",
    );
  });

  it("события: data не по схеме — в истории с замечаниями (политика log), необъявленный тип агент не принимает", async () => {
    const emit = (body: object) =>
      fetchWorker({
        method: "POST",
        path: "/emit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const marker = `метка-${Date.now()}`;

    expectStatus(
      await emit({ type: "echo.echoed", data: { text: marker, length: "x" } }),
      202,
    );

    const undeclared = expectStatus(await emit({ type: "echo.nope" }), 400);

    expect(undeclared.data.code).to.equal("EVENT_UNDECLARED");

    const stored = await eventually(
      async () =>
        items(
          (
            await call(
              admin,
              "GET",
              `/api/v1/agents/events?agentId=${agentId}&type=echo.echoed&limit=50`,
            )
          ).data,
        ).find((e: any) => e.data?.text === marker),
      { what: "событие не по схеме — в истории" },
    );

    expect(stored.problems).to.be.an("array").with.length.above(0);
    expect(stored.problems.join(" ")).to.include("length");

    // Ответ на POST /echo — событие echo.echoed по схеме, без замечаний.
    await fetchWorker({
      method: "POST",
      path: "/echo",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: marker }),
    });

    const valid = await eventually(
      async () =>
        items(
          (
            await call(
              admin,
              "GET",
              `/api/v1/agents/events?agentId=${agentId}&type=echo.echoed&limit=50`,
            )
          ).data,
        ).find((e: any) => e.data?.text === `> ${marker.toUpperCase()}`),
      { what: "событие по схеме" },
    );

    expect(valid).to.not.have.property("problems");
  });

  it("комната агента: метрики раз в секунду и журнал (watch), уровень журнала", async () => {
    const points: number[] = [];
    const onMetrics = (m: any) => {
      if (m.agentId === agentId) points.push(m.point.at);
    };

    socket.socket.on("agent:metrics", onMetrics);

    const log = socket.next(
      "agent:log",
      (l: any) => l.agentId === agentId && l.entries.length > 0,
      15_000,
    );

    await eventually(async () => points.length >= 3, {
      what: "метрики по наблюдению",
      timeoutMs: 15_000,
    });
    socket.socket.off("agent:metrics", onMetrics);
    await fetchWorker({ path: "/stream?n=1" });
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
    expect(point.workers.echo).to.include.keys("requests", "echoed");
  });

  it("очередь demo.echo, быстрая задача echo.quick: итог сразу из ответа воркера, без событий", async () => {
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

    const events = items(
      (
        await call(
          admin,
          "GET",
          `/api/v1/agents/events?agentId=${agentId}&worker=echo&limit=100`,
        )
      ).data,
    );

    expect(events.some((e: any) => e.data?.jobId === created.jobId)).to.equal(
      false,
    );
  });

  it("запрос воркера к серверу: задача echo.quick с lookup — префикс от обработчика echo.lookup; отказ обработчика — провал без повторов", async () => {
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
    expect(failed.attempt ?? 0, "без повторов").to.be.at.most(1);
    expect(JSON.stringify(failed.error)).to.include("ECHO_TEXT_TOO_LONG");
  });

  it("очередь demo.echo, долгая задача echo.long: ход событиями job.progress, итог job.done, файл итога — ссылка на скачивание", async () => {
    const progress = socket.next(
      "agent:event",
      (e: any) => e.type === "job.progress",
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
    expect((await progress).data).to.include({ jobId: started.jobId });
    expect(await readStored(`jobs/${started.jobId}/echo.txt`)).to.equal(
      "> ЗАДАЧА",
    );

    // Файл итога — подписанная ссылка на скачивание (GET) со сроком и размером.
    expect(job.outputs).to.have.length(1);

    const [output] = job.outputs;

    expect(output).to.include({
      name: "result",
      size: Buffer.byteLength("> ЗАДАЧА"),
    });
    expect(new Date(output.expiresAt).getTime()).to.be.greaterThan(Date.now());

    const download = await fetch(output.url);

    expect(download.status).to.equal(200);
    expect(await download.text()).to.equal("> ЗАДАЧА");
    expect(
      (await fetch(output.url.replace(/(X-Amz-Signature|sig)=[^&]+/, "$1=0")))
        .status,
      "ссылка без верной подписи",
    ).to.be.oneOf([400, 401, 403]);

    const listed = items(
      expectStatus(await call(admin, "GET", "/api/v1/jobs?limit=20"), 200).data,
    ).find((j: any) => j.id === started.jobId);

    expect(listed.outputs[0].name).to.equal("result");

    const feed = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/events?agentId=${agentId}&worker=echo&type=job.done&limit=5`,
      ),
      200,
    ).data;

    expect(items(feed).map((e: any) => e.data.jobId)).to.include(started.jobId);

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

  it("очередь demo.echo: отмена уходит воркеру (job.cancelled), провал задачи — failed", async () => {
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
    await eventually(
      async () => worker(await getAgent(), "echo").health?.busy === true,
      { what: "воркер занят (health.busy)" },
    );

    expectStatus(
      await call(admin, "POST", `/api/v1/jobs/${long.jobId}/cancel`),
      204,
    );
    expect((await jobSettled(long.jobId)).status).to.equal("cancelled");
    await eventually(
      async () =>
        items(
          (
            await call(
              admin,
              "GET",
              `/api/v1/agents/events?agentId=${agentId}&type=job.cancelled`,
            )
          ).data,
        ).some((e: any) => e.data.jobId === long.jobId),
      { what: "воркер прервал задачу" },
    );

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

  it("вторая копия API: вызовы агента пересылаются в копию с соединением (relay), AGENT_ELSEWHERE не доходит", async () => {
    const peer = await startPeerServer();

    try {
      const via = { baseUrl: peer.url };
      const card = expectStatus(
        await call(admin, "GET", `/api/v1/agents/${agentId}`, undefined, via),
        200,
      ).data;

      // Адрес копии — её внутренний сервер пересылки, не публичный порт.
      expect(card.session.instance).to.equal(RELAY_URL);
      expect(card.session.instance).to.not.equal(BASE_URL);

      const echo = expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/agents/${agentId}/workers/echo/fetch`,
          {
            method: "POST",
            path: "/echo",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: "через копию" }),
          },
          via,
        ),
        200,
      );

      expect(echo.data).to.deep.equal({ text: "> ЧЕРЕЗ КОПИЮ" });
      expect(echo.headers.get("x-agent-worker-status")).to.equal("200");

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

      const created = expectStatus(
        await call(
          admin,
          "POST",
          "/api/v1/jobs/demo/echo",
          { text: "копия", long: true, steps: 20, delayMs: 200 },
          via,
        ),
        201,
      ).data;

      await eventually(
        async () =>
          (await call(admin, "GET", `/api/v1/jobs/${created.jobId}`)).data
            ?.progress > 0,
        { what: "задача из второй копии идёт" },
      );
      expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/jobs/${created.jobId}/cancel`,
          undefined,
          via,
        ),
        204,
      );
      expect((await jobSettled(created.jobId)).status).to.equal("cancelled");

      // Пересылка — только на внутреннем порту и только с общим секретом;
      // публичный порт её не обслуживает.
      const relayCall = (base: string) =>
        fetch(`${base}/internal/agent-relay`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: "logs", agentId, args: [{}] }),
        });

      expect((await relayCall(peer.relayUrl)).status).to.equal(401);
      expect((await relayCall(peer.url)).status).to.equal(404);
      expect((await relayCall(BASE_URL)).status).to.equal(404);
      expect(
        (await fetch(`${peer.relayUrl}/api/v1/agents`)).status,
        "внутренний порт — только пересылка",
      ).to.equal(404);
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
    expect(logs.entries[0]).to.include({ source: "echo" });
  });

  it("отложенная замена: занятый воркер — ответ сразу (deferred), итог — событие agent:action", async () => {
    const long = expectStatus(
      await call(admin, "POST", "/api/v1/jobs/demo/echo", {
        text: "работа",
        long: true,
        // Окно busy заметно длиннее опроса /health агентом (5 с): замена точно попадает в него.
        steps: 30,
        delayMs: 400,
      }),
      201,
    ).data;

    // Задача именно этого теста уже идёт (есть ход), и агент видит воркер занятым: busy в
    // статусе мог остаться от прошлой задачи, пока агент снова не опросил /health.
    await eventually(
      async () => {
        const job = (await call(admin, "GET", `/api/v1/jobs/${long.jobId}`))
          .data;

        return job?.status === "running" && (job?.progress ?? 0) > 0;
      },
      { what: "задача идёт (есть ход)", timeoutMs: 20_000 },
    );
    await eventually(
      async () => worker(await getAgent(), "echo").health?.busy === true,
      { what: "воркер занят (health.busy)" },
    );

    const asked = Date.now();
    const deferred = expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/restart`,
        {},
      ),
      200,
    ).data;

    expect(Date.now() - asked).to.be.below(3_000);
    expect(deferred).to.include({ deferred: true, pending: "restart" });
    expect(deferred.actionId).to.be.a("string");

    const action = await socket.next(
      "agent:action",
      (a: any) => a.id === deferred.actionId,
      60_000,
    );

    expect(action).to.include({
      name: "worker.restart",
      status: "done",
      deferred: true,
    });
    expect((await jobSettled(long.jobId)).status).to.equal("completed");
  });

  it("перезапуск воркера; обновление не из выпуска — 409; обновление агента — отказ агента", async () => {
    const before = items(
      (
        await call(
          admin,
          "GET",
          `/api/v1/agents/events?agentId=${agentId}&type=echo.started`,
        )
      ).data,
    ).length;

    expect(
      expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/agents/${agentId}/workers/echo/restart`,
          { force: true },
        ),
        200,
      ).data,
    ).to.deep.equal({ deferred: false });
    await eventually(
      async () =>
        items(
          (
            await call(
              admin,
              "GET",
              `/api/v1/agents/events?agentId=${agentId}&type=echo.started`,
            )
          ).data,
        ).length > before,
      { what: "воркер запущен заново", timeoutMs: 20_000 },
    );
    expect(worker(await getAgent(), "echo").state).to.equal("running");

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
      await call(admin, "POST", `/api/v1/agents/${agentId}/update`),
      409,
      "UPDATE_NOT_SUPPORTED",
    );
  });

  it("выпуск: манифест, команда установки, install.sh; проблемы", async () => {
    const release = expectStatus(
      await call(admin, "GET", "/api/v1/agent-releases"),
      200,
    ).data;

    expect(release.manifest.version).to.equal(AGENT_VERSION);
    expect(release.manifest.workers.map((w: any) => w.name)).to.include(
      "netprobe",
    );

    const command = expectStatus(
      await call(admin, "POST", "/api/v1/agent-releases/install-command", {
        token: "tok.secret",
        name: "node-01",
        workers: ["netprobe"],
      }),
      200,
    ).data.command;

    expect(command).to.include("/api/v1/agent-link/install.sh");
    expect(command).to.include("--instance 'rest'");
    expect(command).to.include("--worker 'netprobe'");
    expectStatus(
      await call(admin, "POST", "/api/v1/agent-releases/install-command", {
        name: "x",
      }),
      400,
    );

    const script = await fetch(`${BASE_URL}/api/v1/agent-link/install.sh`);

    expect(script.status).to.equal(200);
    expect(await script.text()).to.include(BASE_URL);
    expectStatus(await call(admin, "GET", "/api/v1/agents/alerts"), 200);
    expectStatus(
      await call(admin, "GET", `/api/v1/agents/alerts?agentId=${agentId}`),
      200,
    );
  });

  it("аудит: действия над агентом и их итоги — от имени пользователя", async () => {
    const audit = expectStatus(
      await call(admin, "GET", "/api/v1/audit?type=agent.action&limit=100"),
      200,
    );
    const actions = items(audit.data)
      .filter((e: any) => e.actorId === admin.id)
      .map((e: any) => e.meta.action);

    expect(actions).to.include.members([
      "config.set",
      "fetch",
      "worker.restart",
    ]);

    // В аудите — только изменяющие запросы к воркеру.
    const fetches = items(audit.data).filter(
      (e: any) => e.meta.action === "fetch",
    );

    expect(fetches.map((e: any) => e.meta.method)).to.include("POST");
    expect(fetches.map((e: any) => e.meta.method)).to.not.include("GET");

    const results = items(
      expectStatus(
        await call(
          admin,
          "GET",
          "/api/v1/audit?type=agent.action-result&limit=50",
        ),
        200,
      ).data,
    );

    expect(results.map((e: any) => e.meta.action)).to.include("worker.restart");
  });

  it("смена ключа: агент переподключается; удаление ключа настроек", async () => {
    const connectedAt = (await getAgent()).connectedAt;

    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentId}/rotate-key`),
      204,
    );
    await eventually(
      async () => {
        const a = await getAgent();

        return a.online && a.connectedAt !== connectedAt;
      },
      { what: "подключение с новым ключом", timeoutMs: 20_000 },
    );

    const removed = socket.next(
      "agent:config",
      (c: any) => c.key === "settings" && c.state === "deleted",
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
    expect((await removed).version).to.equal(null);
    expectStatus(
      await call(
        admin,
        "DELETE",
        `/api/v1/agents/${agentId}/workers/echo/configs/settings`,
      ),
      404,
    );
  });

  it("агент остановлен — online: false в сокете сразу, не дольше ~5 с", async () => {
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
    await agent.stop();

    const deleted = socket.next("agent:deleted", (a: any) => a.id === agentId);

    expectStatus(await call(admin, "DELETE", `/api/v1/agents/${agentId}`), 204);
    await deleted;
    expectStatus(await call(admin, "GET", `/api/v1/agents/${agentId}`), 404);
  });
});
