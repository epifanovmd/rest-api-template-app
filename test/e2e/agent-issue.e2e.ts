import { expect } from "chai";
import { ChildProcess, execFileSync, spawn } from "child_process";
import { once } from "events";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { enroll, platform } from "./agent";
import {
  Actor,
  call,
  calledEndpoints,
  eventually,
  expectStatus,
  signInAdmin,
} from "./client";
import { BASE_URL } from "./harness";

/** Распакованный архив агента и запущенный из него агент (`./agent run --env prod`). */
interface IUnpacked {
  dir: string;
  process?: ChildProcess;
  output: string[];
}

const unpack = (archive: Buffer): IUnpacked => {
  const root = mkdtempSync(join(tmpdir(), "e2e-issue-"));

  execFileSync("tar", ["-xzf", "-", "-C", root], { input: archive });

  return { dir: join(root, "agent"), output: [] };
};

/** Агент из архива на месте — как у получателя: настройки и `.env` — из архива. */
const runFrom = (unpacked: IUnpacked): ChildProcess => {
  const child = spawn(join(unpacked.dir, "agent"), ["run", "--env", "prod"], {
    cwd: unpacked.dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: unpacked.dir,
      AGENT_DATA_DIR: join(unpacked.dir, "..", "data"),
      AGENT_UPDATE_MODE: "disabled",
      AGENT_NO_UPDATE_CHECK: "1",
    },
  });

  child.stdout?.on("data", c => unpacked.output.push(String(c)));
  child.stderr?.on("data", c => unpacked.output.push(String(c)));
  unpacked.process = child;

  return child;
};

const stop = async (unpacked: IUnpacked): Promise<void> => {
  const child = unpacked.process;

  if (child && child.exitCode === null) {
    const exited = once(child, "exit");

    child.kill("SIGTERM");
    await exited;
  }
  try {
    execFileSync(
      join(unpacked.dir, "agent"),
      ["stop-workers", "--env", "prod"],
      {
        cwd: unpacked.dir,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: unpacked.dir,
          AGENT_DATA_DIR: join(unpacked.dir, "..", "data"),
          AGENT_SERVER_REQUIRED: "false",
        },
      },
    );
  } catch {
    // воркеры уже остановлены
  }
  rmSync(join(unpacked.dir, ".."), { recursive: true, force: true });
};

describe("выдача агента: архив с токеном, .env и одноразовая ссылка", function () {
  this.timeout(120_000);

  const PLATFORM = platform();
  let admin: Actor;
  let nodeId: string;
  const unpacked: IUnpacked[] = [];

  /** Архив — двоичный ответ: напрямую, с учётом в покрытии спецификации. */
  const download = async (path: string, body: unknown): Promise<Response> => {
    calledEndpoints.push({ method: "POST", path });

    return fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.access}`,
        "content-type": "application/json",
        "x-forwarded-for": admin.ip,
      },
      body: JSON.stringify(body),
    });
  };

  before(async () => {
    admin = await signInAdmin();
    nodeId = expectStatus(
      await call(admin, "POST", "/api/v1/nodes", { name: "e2e-issue" }),
      201,
    ).data.id;
  });

  after(async () => {
    for (const u of unpacked) await stop(u);
  });

  it("варианты установки: архив этой платформы с compose.yml, адрес сервера", async () => {
    const options = expectStatus(
      await call(admin, "GET", "/api/v1/agent-enrollment/install-options"),
      200,
    ).data;

    expect(options.server).to.equal(BASE_URL);
    expect(
      options.archives.find((a: any) => a.platform === PLATFORM),
    ).to.include({ compose: true });
  });

  it("архив узла с токеном: .env (0600) в архиве, агент из архива регистрируется и привязывается к узлу", async () => {
    const res = await download(`/api/v1/nodes/${nodeId}/agent/issue/archive`, {
      platform: PLATFORM,
      name: "e2e-issued",
    });

    expect(res.status).to.equal(200);
    expect(res.headers.get("content-disposition")).to.match(
      new RegExp(`${PLATFORM}\\.tar\\.gz`),
    );
    const archive = unpack(Buffer.from(await res.arrayBuffer()));

    unpacked.push(archive);
    const envFile = join(archive.dir, ".env");
    const env = readFileSync(envFile, "utf8");

    expect((statSync(envFile).mode % 0o1000).toString(8)).to.equal("600");
    expect(env).to.include(`AGENT_SERVER_URL=${BASE_URL}`);
    expect(env).to.include("AGENT_NAME=e2e-issued");
    expect(env).to.include("AGENT_SERVER_ALLOW_INSECURE=true");
    for (const file of [
      "compose.yml",
      "Dockerfile",
      ".env.example",
      "README.md",
    ]) {
      expect(existsSync(join(archive.dir, file)), file).to.equal(true);
    }
    const token = /AGENT_ENROLL_TOKEN=(\S+)/.exec(env)![1];

    runFrom(archive);
    const node = await eventually(
      async () => {
        const n = expectStatus(
          await call(admin, "GET", `/api/v1/nodes/${nodeId}`),
          200,
        ).data;

        return n.agentId ? n : undefined;
      },
      { what: "агент из архива привязан к узлу", timeoutMs: 30_000 },
    ).catch(err => {
      throw new Error(`${(err as Error).message}\n${archive.output.join("")}`);
    });
    const agent = expectStatus(
      await call(admin, "GET", `/api/v1/agents/${node.agentId}`),
      200,
    ).data;

    expect(agent).to.include({ name: "e2e-issued" });
    expect(agent.labels).to.include({ nodeId });
    // Токен одноразовый.
    expect((await enroll(token, "e2e-again")).status).to.equal(401);
  });

  it("архив без .env: агент не запускается и пишет, чего не хватает", async () => {
    const res = await download("/api/v1/agent-enrollment/issue/archive", {
      platform: PLATFORM,
    });
    const archive = unpack(Buffer.from(await res.arrayBuffer()));

    unpacked.push(archive);
    rmSync(join(archive.dir, ".env"));
    const child = runFrom(archive);
    // close — после exit и конца вывода: текст ошибки уже прочитан.
    const [code] = await once(child, "close");

    expect(code).to.not.equal(0);
    expect(archive.output.join("")).to.include("AGENT_SERVER_URL");
  });

  it("одноразовая ссылка: архив с токеном один раз, затем 410", async () => {
    const link = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment/issue/link", {
        platform: PLATFORM,
        name: "e2e-link",
        linkExpiresInMinutes: 10,
      }),
      201,
    ).data;

    expect(link.url).to.match(
      new RegExp(`^${BASE_URL}/agent/v1/bundle/issued/[0-9a-f-]{36}$`),
    );
    const first = await fetch(link.url);

    expect(first.status).to.equal(200);
    const archive = unpack(Buffer.from(await first.arrayBuffer()));

    unpacked.push(archive);
    const token = /AGENT_ENROLL_TOKEN=(\S+)/.exec(
      readFileSync(join(archive.dir, ".env"), "utf8"),
    )![1];

    expect((await enroll(token, "e2e-link")).status).to.equal(200);
    expect((await fetch(link.url)).status).to.equal(410);

    const nodeLink = expectStatus(
      await call(admin, "POST", `/api/v1/nodes/${nodeId}/agent/issue/link`, {
        platform: PLATFORM,
      }),
      201,
    ).data;

    expect((await fetch(nodeLink.url)).status).to.equal(200);
  });

  it(".env отдельно: токен для архива или образа (--env-file)", async () => {
    const issued = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment/issue/env", {
        name: "e2e-env",
        maxUses: 2,
      }),
      201,
    ).data;

    expect(issued.env).to.include(`AGENT_ENROLL_TOKEN=${issued.token}`);
    expect(issued.env).to.include("AGENT_NAME=e2e-env");
    expect((await enroll(issued.token, "e2e-env-1")).status).to.equal(200);
    expect((await enroll(issued.token, "e2e-env-2")).status).to.equal(200);
    expect((await enroll(issued.token, "e2e-env-3")).status).to.equal(401);

    const node = expectStatus(
      await call(admin, "POST", `/api/v1/nodes/${nodeId}/agent/issue/env`, {}),
      201,
    ).data;

    expect(node.env).to.include("AGENT_NAME=");
  });

  it("платформы, которой нет в каталоге архивов, — 404", async () => {
    const other = ["linux-amd64", "linux-arm64", "darwin-arm64"].find(
      p => p !== PLATFORM,
    )!;
    const res = await download("/api/v1/agent-enrollment/issue/archive", {
      platform: other,
    });

    expect(res.status).to.equal(404);
  });

  it("команда запуска в Docker: архив под платформу машины, .env, docker compose", async () => {
    const { command } = expectStatus(
      await call(admin, "POST", "/api/v1/agent-enrollment/install-command", {
        token: "abc.def",
        mode: "docker",
        name: "vps-1",
      }),
      200,
    ).data;

    expect(command).to.include(`${BASE_URL}/agent/v1/bundle/linux-`);
    expect(command).to.include("'AGENT_ENROLL_TOKEN=abc.def'");
    expect(command).to.include("docker compose up -d --build");
  });
});
