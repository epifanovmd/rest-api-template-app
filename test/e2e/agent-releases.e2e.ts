import { expect } from "chai";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { createServer } from "http";
import { AddressInfo } from "net";

import { ECHO_PREVIOUS_VERSION, platform, RealAgent } from "./agent";
import { Actor, call, eventually, expectStatus, signInAdmin } from "./client";
import {
  AGENT_BOOTSTRAP_TOKEN,
  AGENT_VERSION,
  BASE_URL,
  PROJECT_KEYS,
} from "./harness";
import { connectSocket, TestSocket } from "./socket";

/** Версия воркера echo в исходниках — она же в сборках воркеров проекта. */
const ECHO_VERSION = readFileSync("agent/workers/echo/VERSION", "utf8").trim();

/** Следующая версия агента: патч + 1. */
const NEXT_VERSION = AGENT_VERSION.replace(
  /(\d+)$/,
  patch => `${Number(patch) + 1}`,
);

describe("сборки воркеров проекта и обновление агента", function () {
  this.timeout(120_000);

  let admin: Actor;
  let socket: TestSocket;
  let agent: RealAgent;
  let agentId: string;

  const release = async () =>
    expectStatus(await call(admin, "GET", "/api/v1/agent-releases"), 200).data;

  before(async () => {
    admin = await signInAdmin();
    socket = await connectSocket(admin);
    expect((await socket.join("agents")).ok).to.equal(true);
    agent = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-release-agent",
      workers: ["echo-release"],
      // Кандидат на обновление — только агент, который обновляет себя сам (self);
      // сам он ничего не ставит, пока сервер не пришлёт agent.update.
      updateMode: "self",
    });
    agentId = agent.agentId;
  });

  after(async () => {
    socket?.close();
    await agent?.stop();
  });

  it("агент на связи; манифест сборок — воркеры проекта из release/ каталога архивов", async () => {
    const card = await eventually(
      async () => {
        const a = (await call(admin, "GET", `/api/v1/agents/${agentId}`)).data;
        const echo = a?.workers?.find((w: any) => w.name === "echo");

        return a?.online && echo?.state === "running" && a;
      },
      { what: "агент и воркер echo на связи", timeoutMs: 30_000 },
    );

    expect(card.version).to.equal(AGENT_VERSION);

    const { manifest } = await release();
    const sources = Object.fromEntries(
      manifest.workers.map((w: any) => [w.name, w.source]),
    );

    expect(sources).to.deep.equal({ echo: "local" });
    for (const w of manifest.workers) {
      expect(w.url).to.equal(
        `/api/v1/agent-link/releases/${encodeURIComponent(w.file)}`,
      );
    }
  });

  it("установка с сервера: скрипт и архив папки агента (ключ проекта — в нём); сборка воркера — с сервера", async () => {
    const script = await (
      await fetch(`${BASE_URL}/api/v1/agent-link/bundle/install.sh`)
    ).text();

    // Установщик агента из его релиза (раздаёт бэкенд из каталога архивов).
    expect(script).to.include("--bundle URL");
    expect(script).to.include(
      '"$AGENT" install ${SERVER:+--server "$SERVER"} "$@"',
    );

    const archive = await fetch(
      `${BASE_URL}/api/v1/agent-link/bundle/${platform()}.tar.gz`,
    );

    expect(archive.status).to.equal(200);
    const info = JSON.parse(
      execFileSync("tar", ["-xzOf", "-", "agent/bundle.json"], {
        input: Buffer.from(await archive.arrayBuffer()),
      }).toString("utf8"),
    );

    expect(info).to.include({
      version: AGENT_VERSION,
      config: "agent.prod.yaml",
      env: "prod",
    });
    expect(info.publicKeys).to.deep.equal([PROJECT_KEYS.public]);
    expect(info.workers).to.include("echo");
    expect(
      (await fetch(`${BASE_URL}/api/v1/agent-link/bundle/linux-sparc.tar.gz`))
        .status,
    ).to.equal(404);

    const { manifest } = await release();
    const build = manifest.workers.find((w: any) => w.name === "echo");
    const body = Buffer.from(
      await (await fetch(`${BASE_URL}${build.url}`)).arrayBuffer(),
    );

    expect(createHash("sha256").update(body).digest("hex")).to.equal(
      build.sha256.toLowerCase(),
    );
  });

  it("новую версию нашёл сам агент: update агента, кандидат source=agent, agent:updated в сокете", async () => {
    // Свой каталог сборок агента: новее только для него — сервер её не видит.
    const catalog = createServer((req, res) => {
      if (!req.url?.endsWith("/latest/download/manifest.json")) {
        res.writeHead(404).end();

        return;
      }
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ version: NEXT_VERSION, artifacts: [] }));
    });

    await new Promise<void>(r => catalog.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(catalog.address() as AddressInfo).port}`;
    const reported = socket.next(
      "agent:updated",
      (a: any) =>
        a.name === "e2e-self-check" && a.update?.latest === NEXT_VERSION,
      20_000,
    );
    const self = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-self-check",
      updateReleases: url,
      updateMode: "self",
    });

    try {
      expect((await reported).version).to.equal(AGENT_VERSION);
      const card = expectStatus(
        await call(admin, "GET", `/api/v1/agents/${self.agentId}`),
        200,
      ).data;

      expect(card.update).to.include({ latest: NEXT_VERSION });
      // Режим обновления — из hello; агент запущен не agent install — способа установки нет.
      expect(card.updateMode).to.equal("self");
      expect(card.install).to.equal(undefined);
      expect(
        (await release()).candidates.find(
          (c: any) => c.agentId === self.agentId,
        ),
      ).to.include({
        current: AGENT_VERSION,
        target: NEXT_VERSION,
        source: "agent",
      });
    } finally {
      await self.stop();
      catalog.close();
    }
  });

  it("воркер проекта обновляется с сервера: подпись ключом проекта", async () => {
    const { workerCandidates } = await release();

    expect(
      workerCandidates.find(
        (c: any) => c.agentId === agentId && c.worker === "echo",
      ),
    ).to.include({ current: ECHO_PREVIOUS_VERSION, target: ECHO_VERSION });

    const updated = expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/update`,
        {
          force: true,
        },
      ),
      200,
    ).data;

    expect(updated).to.include({
      deferred: false,
      version: ECHO_VERSION,
      previous: ECHO_PREVIOUS_VERSION,
    });
    await eventually(
      async () => {
        const a = (await call(admin, "GET", `/api/v1/agents/${agentId}`)).data;
        const echo = a?.workers?.find((w: any) => w.name === "echo");

        return (
          echo?.state === "running" &&
          echo.version === ECHO_VERSION &&
          echo.manifest?.version === ECHO_VERSION
        );
      },
      { what: "echo новой версии работает", timeoutMs: 30_000 },
    );
  });
});
