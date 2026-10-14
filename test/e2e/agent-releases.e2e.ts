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

  const getAgent = async (id = agentId) =>
    expectStatus(await call(admin, "GET", `/api/v1/agents/${id}`), 200).data;
  const echoOf = (a: any) => a?.workers?.find((w: any) => w.name === "echo");

  before(async () => {
    admin = await signInAdmin();
    socket = await connectSocket(admin);
    expect((await socket.join("agents")).ok).to.equal(true);
    agent = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-release-agent",
      workers: ["echo-release"],
      updateMode: "external",
    });
    agentId = agent.agentId;
  });

  after(async () => {
    socket?.close();
    await agent?.stop();
  });

  it("каталог сборок воркеров: API и публичный manifest.json; у агента — новая сборка воркера", async () => {
    const card = await eventually(
      async () => {
        const a = await getAgent();

        return a.online && echoOf(a)?.state === "running" && a;
      },
      { what: "агент и воркер echo на связи", timeoutMs: 30_000 },
    );

    expect(card.version).to.equal(AGENT_VERSION);
    expect(echoOf(card)).to.include({
      release: true,
      version: ECHO_PREVIOUS_VERSION,
      updateAvailable: ECHO_VERSION,
    });

    const release = expectStatus(
      await call(admin, "GET", "/api/v1/agent-enrollment/release"),
      200,
    ).data;
    const [os, arch] = platform().split("-");

    expect(release.bundle).to.equal(true);
    expect(release.workers).to.deep.include({
      name: "echo",
      version: ECHO_VERSION,
      os,
      arch,
    });

    const manifest: any = await (
      await fetch(`${BASE_URL}/agent/v1/releases/manifest.json`)
    ).json();
    const build = manifest.workers.find((w: any) => w.name === "echo");
    const body = Buffer.from(
      await (
        await fetch(`${BASE_URL}/agent/v1/releases/${build.file}`)
      ).arrayBuffer(),
    );

    expect(createHash("sha256").update(body).digest("hex")).to.equal(
      build.sha256.toLowerCase(),
    );
    expect(
      (await fetch(`${BASE_URL}/agent/v1/releases/..%2Fmanifest.json`)).status,
    ).to.equal(404);
  });

  it("установка с сервера: скрипт и архив папки агента (ключ проекта — в нём)", async () => {
    const script = await (
      await fetch(`${BASE_URL}/agent/v1/bundle/install.sh`)
    ).text();

    expect(script).to.include("--bundle URL");
    expect(script).to.include(
      '"$AGENT" install ${SERVER:+--server "$SERVER"} "$@"',
    );

    const archive = await fetch(`${BASE_URL}/agent/v1/bundle/agent.tar.gz`);

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
    expect(info.platforms).to.deep.equal([platform().replace("-", "/")]);
    expect(
      (await fetch(`${BASE_URL}/agent/v1/bundle/linux-amd64.tar.gz`)).status,
    ).to.equal(404);
  });

  it("воркер проекта обновляется с сервера: подпись ключом проекта, итог — команда", async () => {
    const queued = expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/update`,
        { force: true },
      ),
      200,
    ).data;

    expect(queued).to.include({
      type: "worker.update",
      worker: "echo",
      status: "pending",
    });
    expect(queued.args).to.include({ worker: "echo", version: ECHO_VERSION });

    const done = expectStatus(
      await call(
        admin,
        "GET",
        `/api/v1/agents/${agentId}/commands/${queued.id}?waitSeconds=60`,
      ),
      200,
    ).data;

    expect(done.ok, JSON.stringify(done.error)).to.equal(true);
    expect(done.result).to.deep.equal({
      version: ECHO_VERSION,
      previous: ECHO_PREVIOUS_VERSION,
    });
    await eventually(
      async () => {
        const echo = echoOf(await getAgent());

        return (
          echo?.state === "running" &&
          echo.version === ECHO_VERSION &&
          !echo.updateAvailable
        );
      },
      { what: "echo новой версии работает", timeoutMs: 30_000 },
    );
    expectStatus(
      await call(
        admin,
        "POST",
        `/api/v1/agents/${agentId}/workers/echo/update`,
        { version: "9.9.9" },
      ),
      404,
      "AGENT_RELEASE_NOT_FOUND",
    );
  });

  it("новую версию нашёл сам агент: updateAvailable в карточке и сокете; агент в контейнере себя не обновляет", async () => {
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
        a.name === "e2e-self-check" && a.updateAvailable === NEXT_VERSION,
      30_000,
    );
    const self = await RealAgent.start({
      token: AGENT_BOOTSTRAP_TOKEN,
      name: "e2e-self-check",
      updateReleases: url,
      updateMode: "external",
      workers: [],
    });

    try {
      expect((await reported).version).to.equal(AGENT_VERSION);
      const card = await getAgent(self.agentId);

      expect(card).to.include({
        updateMode: "external",
        updateAvailable: NEXT_VERSION,
      });

      const queued = expectStatus(
        await call(admin, "POST", `/api/v1/agents/${self.agentId}/update`, {}),
        200,
      ).data;

      expect(queued.args).to.deep.equal({ version: NEXT_VERSION });
      const done = expectStatus(
        await call(
          admin,
          "GET",
          `/api/v1/agents/${self.agentId}/commands/${queued.id}?waitSeconds=20`,
        ),
        200,
      ).data;

      expect(done).to.include({ status: "done", ok: false });
      expect(done.error.code).to.equal("UPDATE_NOT_SUPPORTED");
    } finally {
      await self.stop();
      catalog.close();
      await call(admin, "DELETE", `/api/v1/agents/${self.agentId}`);
    }
  });
});
