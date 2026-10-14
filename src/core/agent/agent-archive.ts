import { readFile } from "fs/promises";
import { basename } from "path";
import { gunzipSync, gzipSync } from "zlib";

import { agentConfig } from "./agent.config";
import { newestBundleArchive } from "./agent-files";

/** Платформа архива агента для узлов: `<os>-<arch>`. */
export const AGENT_ARCHIVE_PLATFORMS = [
  "linux-amd64",
  "linux-arm64",
  "darwin-amd64",
  "darwin-arm64",
] as const;
export type TAgentArchivePlatform = (typeof AGENT_ARCHIVE_PLATFORMS)[number];

const splitPlatform = (platform: TAgentArchivePlatform): [string, string] =>
  platform.split("-") as [string, string];

/** Папка агента в архиве (`agent pack`). */
const ARCHIVE_ROOT = "agent";

/** Файл переменных получателя в архиве: его читают настройки (`envFiles`) и compose.yml. */
export const AGENT_ARCHIVE_ENV_FILE = ".env";

const BLOCK = 512;

/** Переменные агента для `.env` получателя. */
export interface IAgentEnvValues {
  server: string;
  token: string;
  /** Имя агента на бэкенде; нет — имя машины. */
  name?: string;
}

/** `http://` — агенту нужно явное разрешение связи без шифрования. */
export const isInsecureServer = (server: string): boolean =>
  /^http:\/\//i.test(server);

/** Значение для `.env`: без переводов строк, в кавычках, если нужно. */
const envValue = (value: string): string => {
  const clean = value.replace(/[\r\n]/g, "");

  return /^[A-Za-z0-9_./:@+-]*$/.test(clean)
    ? clean
    : `"${clean.replace(/["\\$`]/g, "\\$&")}"`;
};

/**
 * Текст `.env` получателя архива: адрес бэкенда, токен регистрации, имя; для `http://` —
 * разрешение связи без шифрования.
 */
export const agentEnvText = (values: IAgentEnvValues): string => {
  const lines = [
    "# Агент: адрес бэкенда и токен регистрации (нужен только до первой регистрации).",
    `AGENT_SERVER_URL=${envValue(values.server)}`,
    `AGENT_ENROLL_TOKEN=${envValue(values.token)}`,
  ];

  if (values.name) lines.push(`AGENT_NAME=${envValue(values.name)}`);
  if (isInsecureServer(values.server)) {
    lines.push(
      "# http:// — ключ агента и данные идут открытым текстом.",
      "AGENT_SERVER_ALLOW_INSECURE=true",
    );
  }

  return `${lines.join("\n")}\n`;
};

const octal = (value: number, width: number): string =>
  `${value.toString(8).padStart(width - 1, "0")}\0`;

/** Заголовок ustar обычного файла. */
const tarHeader = (path: string, size: number, mode: number): Buffer => {
  const header = Buffer.alloc(BLOCK);

  header.write(path, 0, 100, "utf8");
  header.write(octal(mode, 8), 100, 8, "ascii");
  header.write(octal(0, 8), 108, 8, "ascii");
  header.write(octal(0, 8), 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, "ascii");
  header.fill(" ", 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  let sum = 0;

  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");

  return header;
};

/** Записи tar: имя и размер; `end` — начало завершающих нулевых блоков. */
const tarEntries = (tar: Buffer): { names: string[]; end: number } => {
  const names: string[] = [];
  let offset = 0;

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);

    if (header.every(byte => byte === 0)) break;
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/s, "");
    const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/s, "");
    const size = parseInt(
      header.toString("ascii", 124, 136).replace(/\0.*$/s, "").trim() || "0",
      8,
    );

    names.push(prefix ? `${prefix}/${name}` : name);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }

  return { names, end: offset };
};

/**
 * Архив `.tar.gz` с ещё одним файлом (права `mode`): прежние записи как есть, новая — перед
 * концом архива. Файл с тем же путём в архиве — ошибка.
 */
export const appendToTarGz = (
  archive: Buffer,
  path: string,
  content: string,
  mode: number,
): Buffer => {
  const tar = gunzipSync(archive);
  const { names, end } = tarEntries(tar);

  if (names.includes(path) || names.includes(`./${path}`)) {
    throw new Error(`в архиве уже есть ${path}`);
  }
  const data = Buffer.from(content, "utf8");
  const padding = Buffer.alloc(
    Math.ceil(data.length / BLOCK) * BLOCK - data.length,
  );

  return gzipSync(
    Buffer.concat([
      tar.subarray(0, end),
      tarHeader(path, data.length, mode),
      data,
      padding,
      Buffer.alloc(BLOCK * 2),
    ]),
  );
};

/** Новейший архив платформы и его записи. */
export interface IAgentArchiveInfo {
  platform: TAgentArchivePlatform;
  file: string;
  /** Версия агента из имени архива (`agent-prod-<версия>-linux-<arch>.tar.gz`). */
  version: string | null;
  size: number;
  /** В архиве есть `compose.yml` (запуск в Docker Compose). */
  compose: boolean;
}

const ARCHIVE_VERSION =
  /-(\d+\.\d+\.\d+[^-]*)-(?:linux|darwin)-(?:amd64|arm64)\.tar\.gz$/;

const infoCache = new Map<string, { mtime: number; info: IAgentArchiveInfo }>();

/** Архивы агента для узлов (`AGENT_BUNDLE_DIR`) по платформам. */
export const agentArchives = async (): Promise<IAgentArchiveInfo[]> => {
  const dir = agentConfig.bundleDir;

  if (!dir) return [];
  const out: IAgentArchiveInfo[] = [];

  for (const platform of AGENT_ARCHIVE_PLATFORMS) {
    const file = await newestBundleArchive(dir, ...splitPlatform(platform));

    if (!file) continue;
    const cached = infoCache.get(file.path);

    if (cached && cached.mtime === file.mtime) {
      out.push(cached.info);
      continue;
    }
    const { names } = tarEntries(gunzipSync(await readFile(file.path)));
    const info: IAgentArchiveInfo = {
      platform,
      file: basename(file.path),
      version: ARCHIVE_VERSION.exec(basename(file.path))?.[1] ?? null,
      size: file.size,
      compose: names.some(
        n => n === `${ARCHIVE_ROOT}/compose.yml` || n === "compose.yml",
      ),
    };

    infoCache.set(file.path, { mtime: file.mtime, info });
    out.push(info);
  }

  return out;
};

/**
 * Архив платформы с `.env` получателя (права 0600): тот же архив, что раздаётся всем, и файл
 * переменных с адресом и токеном. `null` — архива этой платформы нет.
 */
export const agentArchiveWithEnv = async (
  platform: TAgentArchivePlatform,
  values: IAgentEnvValues,
): Promise<{ file: string; data: Buffer } | null> => {
  const dir = agentConfig.bundleDir;
  const file = dir
    ? await newestBundleArchive(dir, ...splitPlatform(platform))
    : null;

  if (!file) return null;

  return {
    file: basename(file.path),
    data: appendToTarGz(
      await readFile(file.path),
      `${ARCHIVE_ROOT}/${AGENT_ARCHIVE_ENV_FILE}`,
      agentEnvText(values),
      0o600,
    ),
  };
};
