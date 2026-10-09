import { ChildProcess, spawn } from "child_process";
import { once } from "events";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { AGENT_DIST_DIR, BASE_URL, PROJECT_KEYS } from "./harness";

/**
 * Настоящий агент (github.com/epifanovmd/agent) для сценариев: программа и
 * воркер netprobe — из сборок агента (`AGENT_DIST_DIR`, `yarn agent:fetch`),
 * воркер echo — из исходников `agent/workers/echo` (python3) или как воркер
 * со сборкой с сервера (`echo-release`: прежняя версия уже стоит, обновление — из
 * сборок воркеров проекта). Агент проверяет подпись воркеров проекта ключом
 * проекта стенда. Работает в своём временном каталоге данных и
 * останавливается вместе с воркерами.
 */
const env = process.env;

export const platform = (): string =>
  `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "amd64"}`;

const agentBinary = (): string => {
  const file = env.E2E_AGENT_BIN ?? join(AGENT_DIST_DIR, `agent-${platform()}`);

  if (!existsSync(file)) {
    throw new Error(
      `E2E: нет программы агента ${file} — yarn agent:fetch (или E2E_AGENT_BIN)`,
    );
  }

  return file;
};

/** Версия воркера echo, которая стоит у агента до обновления с сервера. */
export const ECHO_PREVIOUS_VERSION = "0.9.0";

/** Сборка netprobe под эту машину и её версия — из `manifest.json` сборок. */
const netprobeBuild = (): { file: string; version: string } => {
  const [os, arch] = platform().split("-");
  const manifest = JSON.parse(
    readFileSync(join(AGENT_DIST_DIR, "manifest.json"), "utf8"),
  ) as {
    workers?: {
      name: string;
      version: string;
      os: string;
      arch: string;
      file: string;
    }[];
  };
  const build = manifest.workers?.find(
    w => w.name === "netprobe" && w.os === os && w.arch === arch,
  );

  if (!build) {
    throw new Error(
      `E2E: в сборках ${AGENT_DIST_DIR} нет netprobe для ${platform()} — yarn agent:fetch`,
    );
  }

  return { file: join(AGENT_DIST_DIR, build.file), version: build.version };
};

export interface IEnrollResult {
  status: number;
  agentId?: string;
  secret?: string;
}

/** Регистрация напрямую (без агента): проверка токенов. */
export const enroll = async (
  token: string,
  name: string,
): Promise<IEnrollResult> => {
  const res = await fetch(`${BASE_URL}/api/v1/agent-link/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      name,
      host: { os: "linux", arch: "amd64", hostname: "e2e" },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;

  return { status: res.status, agentId: data.agentId, secret: data.secret };
};

export type TWorkerName = "echo" | "echo-release" | "netprobe";

export interface IStartAgentOptions {
  token: string;
  name: string;
  workers?: TWorkerName[];
  /**
   * `disabled` (по умолчанию) — агент ничего не обновляет; `external` —
   * обновляет воркеры с сервера, но не себя.
   */
  updateMode?: "disabled" | "external";
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const echoEnv = (dataDir: string): string[] => [
  "    env:",
  '      PYTHONUNBUFFERED: "1"',
  `      ECHO_JOBS_DIR: ${JSON.stringify(join(dataDir, "echo-jobs"))}`,
  "    lifecycle:",
  "      { onAgentStop: stop, onAgentRestart: restart, stopTimeout: 5s, health: { interval: 1s, timeout: 1s, failures: 5 } }",
];

const workerYaml = (name: TWorkerName, dataDir: string): string => {
  switch (name) {
    case "echo":
      return [
        "  - name: echo",
        '    command: ["./run"]',
        `    dir: ${JSON.stringify(resolve("agent/workers/echo"))}`,
        ...echoEnv(dataDir),
      ].join("\n");
    case "echo-release":
      return ["  - name: echo", "    release: true", ...echoEnv(dataDir)].join(
        "\n",
      );
    case "netprobe":
      return [
        "  - name: netprobe",
        "    release: true",
        "    lifecycle: { onAgentStop: stop, onAgentRestart: restart, stopTimeout: 5s }",
      ].join("\n");
  }
};

/** Сборка воркера с сервера у агента: `<dataDir>/workers/<имя>/{current,version}`. */
const installReleaseWorker = (
  dataDir: string,
  name: string,
  version: string,
  install: (current: string) => void,
): void => {
  const target = join(dataDir, "workers", name);

  mkdirSync(target, { recursive: true });
  install(join(target, "current"));
  writeFileSync(join(target, "version"), `${version}\n`);
};

export class RealAgent {
  private readonly _logs: string[] = [];

  private constructor(
    readonly dataDir: string,
    private readonly _process: ChildProcess,
  ) {
    _process.stdout?.on("data", chunk => this._logs.push(String(chunk)));
    _process.stderr?.on("data", chunk => this._logs.push(String(chunk)));
  }

  /** Запустить агента с воркерами; дождаться регистрации (ключ на диске). */
  static async start(options: IStartAgentOptions): Promise<RealAgent> {
    const dir = mkdtempSync(join(tmpdir(), "e2e-agent-"));
    const dataDir = join(dir, "data");
    const workers = options.workers ?? ["echo"];

    if (workers.includes("netprobe")) {
      const build = netprobeBuild();

      installReleaseWorker(dataDir, "netprobe", build.version, current =>
        copyFileSync(build.file, current),
      );
    }
    if (workers.includes("echo-release")) {
      installReleaseWorker(dataDir, "echo", ECHO_PREVIOUS_VERSION, current => {
        cpSync(resolve("agent/workers/echo"), current, {
          recursive: true,
          filter: src => !src.includes("__pycache__"),
        });
        writeFileSync(join(current, "VERSION"), `${ECHO_PREVIOUS_VERSION}\n`);
      });
    }

    const config = join(dir, "agent.yaml");

    writeFileSync(
      config,
      [
        "server:",
        `  url: ${BASE_URL}`,
        "  reconnect: { min: 200ms, max: 2s }",
        `dataDir: ${JSON.stringify(dataDir)}`,
        `name: ${JSON.stringify(options.name)}`,
        "enroll:",
        `  token: ${JSON.stringify(options.token)}`,
        "update:",
        `  mode: ${options.updateMode ?? "disabled"}`,
        `  publicKeys: [${JSON.stringify(PROJECT_KEYS.public)}]`,
        "log:",
        "  forward: info",
        "workers:",
        ...workers.map(name => workerYaml(name, dataDir)),
        "",
      ].join("\n"),
    );

    const child = spawn(agentBinary(), ["run", "-config", config], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: env.PATH ?? "", HOME: dir },
    });
    const agent = new RealAgent(dataDir, child);

    await agent.waitForKey();

    return agent;
  }

  /** Id агента из `credentials.json`. */
  get agentId(): string {
    return (
      JSON.parse(
        readFileSync(join(this.dataDir, "credentials.json"), "utf8"),
      ) as { agentId: string }
    ).agentId;
  }

  get log(): string {
    return this._logs.join("");
  }

  /** Остановить агента (воркеры — вместе с ним). */
  async stop(): Promise<void> {
    if (this._process.exitCode !== null) return;

    const exited = once(this._process, "exit");

    this._process.kill("SIGTERM");

    const timer = setTimeout(() => this._process.kill("SIGKILL"), 15_000);

    await exited;
    clearTimeout(timer);
  }

  private async waitForKey(): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      if (this._process.exitCode !== null) break;
      if (existsSync(join(this.dataDir, "credentials.json"))) return;
      await sleep(100);
    }

    throw new Error(
      `E2E: агент не зарегистрировался\n${this.log.slice(-3000)}`,
    );
  }
}
