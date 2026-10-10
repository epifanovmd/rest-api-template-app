import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SDK_VERSION } from "agent-sdk";
import { ChildProcess, execFile, spawn } from "child_process";
import { generateKeyPairSync } from "crypto";
import { once } from "events";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { createServer as createHttpServer, Server } from "http";
import { Redis } from "ioredis";
import { AddressInfo, createServer } from "net";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Client } from "pg";
import { promisify } from "util";

/**
 * Интеграционный стенд: настоящий сервер (`APP_ROLE=all`) поверх Postgres,
 * Redis, SMTP (Mailpit) и S3 (SeaweedFS). Параметры — из окружения E2E_*,
 * по умолчанию — сервисы `docker-compose.dev.yml` (S3 — SeaweedFS).
 */
const env = process.env;

export const E2E = {
  db: {
    host: env.E2E_POSTGRES_HOST ?? "localhost",
    port: Number(env.E2E_POSTGRES_PORT ?? 5432),
    user: env.E2E_POSTGRES_USER ?? "postgres",
    password: env.E2E_POSTGRES_PASSWORD ?? "postgres",
    database: env.E2E_POSTGRES_DB ?? "rest_api_e2e",
  },
  redisUrl: env.E2E_REDIS_URL ?? "redis://localhost:6379/15",
  smtp: {
    host: env.E2E_SMTP_HOST ?? "localhost",
    port: env.E2E_SMTP_PORT ?? "1025",
  },
  mailpitUrl: env.E2E_MAILPIT_URL ?? "http://localhost:8025",
  s3: {
    endpoint: env.E2E_S3_ENDPOINT ?? "http://localhost:8333",
    bucket: env.E2E_S3_BUCKET ?? "e2e",
    accessKeyId: env.E2E_S3_ACCESS_KEY ?? "storage",
    secretAccessKey: env.E2E_S3_SECRET_KEY ?? "storage12345",
  },
  admin: { email: "admin@e2e.local", password: "admin-e2e-password" },
};

/**
 * Свободные порты, все разные: слушатели держатся, пока не выбраны все, —
 * иначе два вызова подряд могут получить один и тот же порт.
 */
const freePorts = async (count: number): Promise<number[]> => {
  const servers = Array.from({ length: count }, () => createServer().listen(0));

  await Promise.all(servers.map(server => once(server, "listening")));
  const ports = servers.map(
    server => (server.address() as { port: number }).port,
  );

  await Promise.all(
    servers.map(server => new Promise(done => server.close(done))),
  );

  return ports;
};

/**
 * Стенд пересоздаёт БД — только с именем, где явно есть «e2e» или «test»:
 * защита от запуска против рабочей базы.
 */
const resetDatabase = async (): Promise<void> => {
  const { database } = E2E.db;

  if (!/e2e|test/i.test(database)) {
    throw new Error(`E2E: база «${database}» не похожа на тестовую — отказ`);
  }

  const admin = new Client({ ...E2E.db, database: "postgres" });

  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();
};

/**
 * Лимиты, присутствие и одноразовые токены живут в Redis — стенд чистит его.
 * Только отдельную базу (не 0): защита от очистки общего Redis.
 */
const resetRedis = async (): Promise<void> => {
  const db = Number(new URL(E2E.redisUrl).pathname.slice(1) || 0);

  if (!db) {
    throw new Error(
      `E2E: Redis ${E2E.redisUrl} — база 0, нужна отдельная (/15)`,
    );
  }

  const redis = new Redis(E2E.redisUrl);

  await redis.flushdb();
  redis.disconnect();
};

/** Содержимое объекта хранилища стенда (S3 или диск) как текст. */
export const readStored = async (key: string): Promise<string> => {
  if ((env.E2E_STORAGE_DRIVER ?? "s3") !== "s3") {
    return readFile(resolve("files", ...key.split("/")), "utf8");
  }

  const s3 = new S3Client({
    endpoint: E2E.s3.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: E2E.s3.accessKeyId,
      secretAccessKey: E2E.s3.secretAccessKey,
    },
  });

  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: E2E.s3.bucket, Key: key }),
    );

    return (await object.Body?.transformToString("utf-8")) ?? "";
  } finally {
    s3.destroy();
  }
};

/** Агенты стенда: общий токен регистрации. */
/** Версия сборок агента — та же, что у agent-sdk. */
export const AGENT_VERSION = SDK_VERSION;

export const AGENT_BOOTSTRAP_TOKEN = "e2e-bootstrap-token-0123456789abcdef0123";

/** Общий секрет копий API: вызовы агентов пересылаются между ними. */
const AGENT_RELAY_SECRET = "e2e-relay-secret-0123456789abcdef0123456789";

/**
 * Сборки агента с GitHub (`yarn agent:fetch`): программа агента и netprobe.
 * Сервер стенда берёт их не из GitHub, а с локального сервера сборок
 * (`AGENT_RELEASES_URL`) — как с GitHub, но без сети.
 */
export const AGENT_DIST_DIR = resolve(
  env.E2E_AGENT_DIST_DIR ?? `agent/dist/v${SDK_VERSION}`,
);

/** Пара ключей проекта (Ed25519, base64): подпись воркеров проекта. */
const projectKeys = (): { signing: string; public: string } => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const b64 = (jwkValue: string | undefined) =>
    Buffer.from(jwkValue ?? "", "base64url").toString("base64");

  return {
    signing: b64(privateKey.export({ format: "jwk" }).d),
    public: b64(publicKey.export({ format: "jwk" }).x),
  };
};

/** Ключи проекта стенда: ими подписаны сборки воркеров проекта. */
export const PROJECT_KEYS = projectKeys();

/** Архивы папки агента стенда (agent pack во временный каталог): AGENT_BUNDLE_DIR. */
let bundleDir = "";

export interface IRemoteRelease {
  /** Адрес каталога сборок для `AGENT_RELEASES_URL`. */
  url: string;
  /** Пути запросов к серверу сборок. */
  requests: string[];
  /** Версия в `manifest.json` источника (`null` — как в файле). */
  setVersion: (version: string | null) => void;
  close: () => Promise<void>;
}

/** Сервер сборок агента (как GitHub): файлы `AGENT_DIST_DIR`. */
const serveRemoteRelease = async (dir: string): Promise<IRemoteRelease> => {
  if (!existsSync(join(dir, "manifest.json"))) {
    throw new Error(`E2E: нет сборок агента в ${dir} — yarn agent:fetch`);
  }
  const requests: string[] = [];
  let version: string | null = null;
  const http: Server = createHttpServer(async (req, res) => {
    const path = req.url ?? "";
    const name = decodeURIComponent(path.split("/").pop() ?? "");

    requests.push(path);
    try {
      let body = await readFile(join(dir, name));

      if (name === "manifest.json" && version) {
        body = Buffer.from(
          JSON.stringify({ ...JSON.parse(body.toString("utf8")), version }),
        );
      }
      res.writeHead(200, { "content-length": body.length });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });

  http.listen(0, "127.0.0.1");
  await once(http, "listening");

  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/download/v${SDK_VERSION}`,
    requests,
    setVersion: v => {
      version = v;
    },
    close: () =>
      new Promise<void>(done => {
        http.closeAllConnections();
        http.close(() => done());
      }),
  };
};

export let REMOTE_RELEASE: IRemoteRelease;

/** Как часто сервер стенда проверяет, не вышла ли новая версия агента, мс. */
export const RELEASE_CHECK_INTERVAL_MS = 500;

/** Платформа этой машины в именах сборок агента: darwin-arm64, linux-amd64. */
const hostPlatform = (): { os: string; arch: string } => ({
  os: process.platform === "darwin" ? "darwin" : "linux",
  arch: process.arch === "arm64" ? "arm64" : "amd64",
});

/**
 * Архив папки агента под эту машину и сборки воркеров проекта (`release/`),
 * подписанные ключом проекта стенда — как `yarn agent:pack`; агент и
 * netprobe — с локального сервера сборок.
 */
const buildProjectBundle = async (): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-agent-bundle-"));
  const { os, arch } = hostPlatform();
  const agentBin =
    env.E2E_AGENT_BIN ?? join(AGENT_DIST_DIR, `agent-${os}-${arch}`);

  await promisify(execFile)(
    agentBin,
    [
      "pack",
      "--env",
      "prod",
      "--platform",
      `${os}/${arch}`,
      "--out",
      dir,
      "--release-out",
      join(dir, "release"),
    ],
    {
      cwd: resolve("agent"),
      env: {
        ...env,
        AGENT_SIGNING_KEY: PROJECT_KEYS.signing,
        AGENT_UPDATE_RELEASES: REMOTE_RELEASE.url.replace(
          /\/download\/v[^/]+$/,
          "",
        ),
        AGENT_NO_UPDATE_CHECK: "1",
      },
    },
  );

  return dir;
};

let server: ChildProcess | undefined;

export let BASE_URL = "";

/** Внутренний сервер пересылки основной копии (её `instanceId`). */
export let RELAY_URL = "";

/**
 * Окружение копии API: публичный порт `port`, внутренний сервер пересылки —
 * `relayPort` (адрес копии — `http://127.0.0.1:<relayPort>`).
 */
const serverEnv = (port: number, relayPort: number): NodeJS.ProcessEnv => ({
  ...env,
  NODE_ENV: "test",
  APP_ROLE: "all",
  APP_PUBLIC_URL: BASE_URL,
  SERVER_HOST: "127.0.0.1",
  SERVER_PORT: String(port),
  TRUST_PROXY: "true",
  API_DOCS_ENABLED: "true",
  SHUTDOWN_DRAIN_MS: "0",
  LOG_LEVEL: env.E2E_LOG_LEVEL ?? "warn",
  RATE_LIMIT: "100000",
  POSTGRES_HOST: E2E.db.host,
  POSTGRES_PORT: String(E2E.db.port),
  POSTGRES_USER: E2E.db.user,
  POSTGRES_PASSWORD: E2E.db.password,
  POSTGRES_DB: E2E.db.database,
  REDIS_URL: E2E.redisUrl,
  SMTP_HOST: E2E.smtp.host,
  SMTP_PORT: E2E.smtp.port,
  SMTP_SECURE: "false",
  SMTP_FROM: "no-reply@e2e.local",
  STORAGE_DRIVER: env.E2E_STORAGE_DRIVER ?? "s3",
  S3_ENDPOINT: E2E.s3.endpoint,
  S3_BUCKET: E2E.s3.bucket,
  S3_ACCESS_KEY_ID: E2E.s3.accessKeyId,
  S3_SECRET_ACCESS_KEY: E2E.s3.secretAccessKey,
  S3_FORCE_PATH_STYLE: "true",
  JWT_SECRET_KEY: "e2e-secret-key-0123456789abcdef0123456789",
  ADMIN_EMAIL: E2E.admin.email,
  ADMIN_PASSWORD: E2E.admin.password,
  AGENT_BOOTSTRAP_TOKEN,
  AGENT_BUNDLE_DIR: bundleDir,
  // Агент и netprobe — с локального сервера сборок, не из GitHub.
  AGENT_RELEASES_GITHUB: "",
  AGENT_RELEASES_URL: REMOTE_RELEASE.url,
  AGENT_RELEASES_CHECK_INTERVAL_MS: String(RELEASE_CHECK_INTERVAL_MS),
  AGENT_RELAY_SECRET,
  AGENT_RELAY_HOST: "127.0.0.1",
  AGENT_RELAY_PORT: String(relayPort),
  AGENT_STATUS_INTERVAL_MS: "1000",
  AGENT_METRICS_INTERVAL_MS: "1000",
  AGENT_METRICS_STORE_INTERVAL_MS: "0",
});

/** Запустить копию API и дождаться готовности. */
const spawnServer = async (
  port: number,
  relayPort: number,
): Promise<ChildProcess> => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv(port, relayPort),
  });
  const logs: string[] = [];

  child.stdout?.on("data", chunk => logs.push(String(chunk)));
  child.stderr?.on("data", chunk => logs.push(String(chunk)));

  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`http://127.0.0.1:${port}/ready`)).status === 200) {
        return child;
      }
    } catch {
      // сервер ещё поднимается
    }
    await new Promise(r => setTimeout(r, 500));
  }

  child.kill("SIGKILL");
  throw new Error(`E2E: сервер не стал готов\n${logs.join("").slice(-4000)}`);
};

export const startServer = async (): Promise<void> => {
  await resetDatabase();
  await resetRedis();
  REMOTE_RELEASE = await serveRemoteRelease(AGENT_DIST_DIR);
  bundleDir = await buildProjectBundle();

  const [port, relayPort] = await freePorts(2);

  BASE_URL = `http://127.0.0.1:${port}`;
  RELAY_URL = `http://127.0.0.1:${relayPort}`;
  server = await spawnServer(port, relayPort);
};

/** Вторая копия API над той же БД и Redis (пересылка вызовов агентов). */
export const startPeerServer = async (): Promise<{
  url: string;
  relayUrl: string;
  stop: () => Promise<void>;
}> => {
  const [port, relayPort] = await freePorts(2);
  const child = await spawnServer(port, relayPort);

  return {
    url: `http://127.0.0.1:${port}`,
    relayUrl: `http://127.0.0.1:${relayPort}`,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await once(child, "exit");
    },
  };
};

export const stopServer = async (): Promise<void> => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  await REMOTE_RELEASE?.close();
  if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
};
