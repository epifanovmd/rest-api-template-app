import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ChildProcess, spawn } from "child_process";
import { once } from "events";
import { createWriteStream } from "fs";
import { readFile } from "fs/promises";
import { Redis } from "ioredis";
import { createServer } from "net";
import { resolve } from "path";
import { Client } from "pg";

/**
 * Интеграционный стенд: настоящий сервер (`APP_ROLE=all`) поверх Postgres,
 * Redis, SMTP (Mailpit) и S3 (SeaweedFS). Параметры — из окружения E2E_*,
 * по умолчанию — сервисы `docker-compose.dev.yml` (`yarn services:up`).
 */
const env = process.env;

export const E2E = {
  db: {
    host: env.E2E_POSTGRES_HOST ?? "localhost",
    port: Number(env.E2E_POSTGRES_PORT ?? 5433),
    user: env.E2E_POSTGRES_USER ?? "postgres",
    password: env.E2E_POSTGRES_PASSWORD ?? "postgres",
    database: env.E2E_POSTGRES_DB ?? "rest_api_e2e",
  },
  redisUrl: env.E2E_REDIS_URL ?? "redis://localhost:6380/15",
  /** Префикс ключей стенда в общем Redis (доступ по префиксу); пусто — отдельная база. */
  redisKeyPrefix: env.E2E_REDIS_KEY_PREFIX ?? "",
  smtp: {
    host: env.E2E_SMTP_HOST ?? "localhost",
    port: env.E2E_SMTP_PORT ?? "1026",
  },
  mailpitUrl: env.E2E_MAILPIT_URL ?? "http://localhost:8026",
  s3: {
    endpoint: env.E2E_S3_ENDPOINT ?? "http://localhost:8334",
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
 * Стенд очищает БД — только с именем, где явно есть «e2e» или «test»: защита от
 * запуска против рабочей базы. Базы нет — создаётся (нужен CREATEDB); есть —
 * пересоздаются её схемы, на что хватает прав владельца базы.
 */
const resetDatabase = async (): Promise<void> => {
  const { database } = E2E.db;

  if (!/e2e|test/i.test(database)) {
    throw new Error(`E2E: база «${database}» не похожа на тестовую — отказ`);
  }

  const db = new Client(E2E.db);

  try {
    await db.connect();
  } catch (error) {
    if ((error as { code?: string }).code !== "3D000") throw error;
    const admin = new Client({ ...E2E.db, database: "postgres" });

    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    return;
  }

  try {
    const { rows } = await db.query<{ name: string; owner: string }>(
      `SELECT nspname AS name, pg_get_userbyid(nspowner) AS owner FROM pg_namespace
       WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'`,
    );
    const foreign = rows.filter(
      row => row.owner !== E2E.db.user && row.name !== "public",
    );

    if (foreign.length) {
      throw new Error(
        `E2E: схемы ${foreign.map(row => `${row.name} (${row.owner})`).join(", ")} базы «${database}» — не роли ${E2E.db.user}: удалите их администратором`,
      );
    }
    for (const { name } of rows) {
      await db.query(`DROP SCHEMA "${name}" CASCADE`);
    }
    await db.query("CREATE SCHEMA public");
  } finally {
    await db.end();
  }
};

/**
 * Лимиты, присутствие и одноразовые токены живут в Redis — стенд чистит его:
 * ключи своего префикса (общий Redis) или отдельную базу (не `0`) — защита от
 * очистки общего Redis.
 */
const resetRedis = async (): Promise<void> => {
  const prefix = E2E.redisKeyPrefix;
  const db = Number(new URL(E2E.redisUrl).pathname.slice(1) || 0);

  if (!prefix && !db) {
    throw new Error(
      `E2E: Redis ${E2E.redisUrl} — база 0 без префикса, нужна отдельная (/15) или E2E_REDIS_KEY_PREFIX`,
    );
  }

  const redis = new Redis(E2E.redisUrl);

  try {
    if (!prefix) {
      await redis.flushdb();

      return;
    }
    for await (const keys of redis.scanStream({
      match: `${prefix}*`,
      count: 500,
    })) {
      if ((keys as string[]).length) await redis.del(...(keys as string[]));
    }
  } finally {
    redis.disconnect();
  }
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

let server: ChildProcess | undefined;

export let BASE_URL = "";

/** Окружение копии API на порту `port` (имя копии — `http://127.0.0.1:<port>`). */
const serverEnv = (port: number): NodeJS.ProcessEnv => ({
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
  REDIS_KEY_PREFIX: E2E.redisKeyPrefix,
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
});

/** Запустить копию API и дождаться готовности. */
const spawnServer = async (port: number): Promise<ChildProcess> => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv(port),
  });
  const logs: string[] = [];

  child.stdout?.on("data", chunk => logs.push(String(chunk)));
  child.stderr?.on("data", chunk => logs.push(String(chunk)));
  // Журнал копии API в файл — разбирать падения сценариев.
  if (env.E2E_SERVER_LOG) {
    const file = createWriteStream(`${env.E2E_SERVER_LOG}.${port}`, {
      flags: "a",
    });

    child.stdout?.pipe(file);
    child.stderr?.pipe(file);
  }

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

  const [port] = await freePorts(1);

  BASE_URL = `http://127.0.0.1:${port}`;
  server = await spawnServer(port);
};

/** Вторая копия API над той же БД и Redis. */
export const startPeerServer = async (): Promise<{
  url: string;
  stop: () => Promise<void>;
}> => {
  const [port] = await freePorts(1);
  const child = await spawnServer(port);

  return {
    url: `http://127.0.0.1:${port}`,
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
};
