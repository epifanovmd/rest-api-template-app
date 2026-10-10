import { expect } from "chai";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { ECHO_PREVIOUS_VERSION, platform, RealAgent } from "./agent";
import { Actor, call, eventually, expectStatus, signInAdmin } from "./client";
import {
  AGENT_BOOTSTRAP_TOKEN,
  AGENT_DIST_DIR,
  AGENT_VERSION,
  BASE_URL,
  PROJECT_KEYS,
  REMOTE_RELEASE,
} from "./harness";
import { connectSocket, TestSocket } from "./socket";

/** manifest.json сборок агента (как на GitHub). */
const distManifest = () =>
  JSON.parse(readFileSync(join(AGENT_DIST_DIR, "manifest.json"), "utf8")) as {
    publicKey: string;
    artifacts: { os: string; arch: string; file: string; sha256: string }[];
  };

/** Версия воркера echo в исходниках — она же в сборках воркеров проекта. */
const ECHO_VERSION = readFileSync("agent/workers/echo/VERSION", "utf8").trim();

/** Следующая версия агента: патч + 1. */
const NEXT_VERSION = AGENT_VERSION.replace(
  /(\d+)$/,
  patch => `${Number(patch) + 1}`,
);

describe("сборки агента из источника и воркеры проекта", function () {
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
      updateMode: "external",
    });
    agentId = agent.agentId;
  });

  after(async () => {
    REMOTE_RELEASE.setVersion(null);
    socket?.close();
    await agent?.stop();
  });

  it("агент из скачанных сборок на связи; итоговый манифест: агент и netprobe — из источника, воркеры проекта — из AGENT_RELEASES_DIR", async () => {
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

    expect(manifest.version).to.equal(AGENT_VERSION);
    expect(manifest.remote).to.include({
      version: AGENT_VERSION,
      from: REMOTE_RELEASE.url,
      publicKey: distManifest().publicKey,
    });
    expect(manifest.artifacts.length).to.be.greaterThan(0);
    for (const a of manifest.artifacts) {
      expect(a).to.include({
        source: "remote",
        url: `${REMOTE_RELEASE.url}/${a.file}`,
      });
    }
    const sources = Object.fromEntries(
      manifest.workers.map((w: any) => [w.name, w.source]),
    );

    expect(sources).to.deep.equal({ netprobe: "remote", echo: "local" });
  });

  it("установка с сервера: скрипт и архив папки агента (ключ проекта — в нём); сборка агента — ссылкой на источник", async () => {
    const script = await (
      await fetch(`${BASE_URL}/api/v1/agent-bundle/install.sh`)
    ).text();

    expect(script).to.include(`SERVER='${BASE_URL}'`);
    expect(script).to.include('install --server "$SERVER" "$@"');

    const archive = await fetch(
      `${BASE_URL}/api/v1/agent-bundle/${platform()}.tar.gz`,
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
    expect(info.workers).to.include.members(["echo", "netprobe"]);
    expect(
      (await fetch(`${BASE_URL}/api/v1/agent-bundle/linux-sparc.tar.gz`))
        .status,
    ).to.equal(404);

    const file = `agent-${platform()}`;
    const redirect = await fetch(
      `${BASE_URL}/api/v1/agent-link/releases/${file}`,
      { redirect: "manual" },
    );

    expect(redirect.status).to.equal(302);
    expect(redirect.headers.get("location")).to.equal(
      `${REMOTE_RELEASE.url}/${file}`,
    );

    const body = Buffer.from(
      await (await fetch(redirect.headers.get("location")!)).arrayBuffer(),
    );

    expect(createHash("sha256").update(body).digest("hex")).to.equal(
      distManifest().artifacts.find(a => a.file === file)?.sha256,
    );
  });

  it("новая версия агента в источнике: событие agent:release и кандидат на обновление", async () => {
    const found = socket.next(
      "agent:release",
      (r: any) => r.version === NEXT_VERSION,
      10_000,
    );

    REMOTE_RELEASE.setVersion(NEXT_VERSION);
    expect(await found).to.deep.equal({
      version: NEXT_VERSION,
      previous: AGENT_VERSION,
      from: REMOTE_RELEASE.url,
    });

    const { manifest, candidates } = await release();

    expect(manifest.version).to.equal(NEXT_VERSION);
    expect(candidates.find((c: any) => c.agentId === agentId)).to.include({
      current: AGENT_VERSION,
      target: NEXT_VERSION,
    });

    const back = socket.next(
      "agent:release",
      (r: any) => r.version === AGENT_VERSION,
      10_000,
    );

    REMOTE_RELEASE.setVersion(null);
    await back;
    expect(
      (await release()).candidates.some((c: any) => c.agentId === agentId),
    ).to.equal(false);
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
