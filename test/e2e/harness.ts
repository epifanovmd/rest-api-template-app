import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ChildProcess, spawn } from "child_process";
import { once } from "events";
import { readFile } from "fs/promises";
import { Redis } from "ioredis";
import { createServer } from "net";
import { resolve } from "path";
import { Client } from "pg";

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

const freePort = async (): Promise<number> => {
  const server = createServer().listen(0);

  await once(server, "listening");
  const { port } = server.address() as { port: number };

  server.close();

  return port;
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
export const AGENT_BOOTSTRAP_TOKEN = "e2e-bootstrap-token-0123456789abcdef0123";

/** Общий секрет копий API: вызовы агентов пересылаются между ними. */
const AGENT_RELAY_SECRET = "e2e-relay-secret-0123456789abcdef0123456789";

/** Каталог выпуска для агентов (настоящий): его раздаёт сервер. */
const AGENT_RELEASES = resolve(env.E2E_AGENT_RELEASES_DIR ?? "agent/release");

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
  AGENT_RELEASES_DIR: AGENT_RELEASES,
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

  const port = await freePort();
  const relayPort = await freePort();

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
  const port = await freePort();
  const relayPort = await freePort();
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
  if (!server || server.exitCode !== null) return;

  server.kill("SIGTERM");
  await once(server, "exit");
};
