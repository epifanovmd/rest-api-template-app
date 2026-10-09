#!/usr/bin/env node
// Сборки агента с GitHub (github.com/epifanovmd/agent) — в agent/dist/v<версия>: программа агента
// под платформы, воркер netprobe, manifest.json и install.sh. Контрольные суммы сверяются с
// manifest.json. Бэкенду этот каталог не нужен (он берёт агента из GitHub сам) — он нужен агенту
// на машине разработчика (agent/dev.sh) и сквозным тестам (сервер сборок без GitHub).
//
//   yarn agent:fetch                 версия — как у agent-sdk в package.json
//   AGENT_VERSION=1.1.0 yarn agent:fetch
//   AGENT_PLATFORMS="linux-amd64 darwin-arm64" yarn agent:fetch   только эти платформы
//
// Печатает каталог сборок. Уже скачанные файлы с верной суммой не скачиваются заново.
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "epifanovmd/agent";

/** Версия агента: AGENT_VERSION или из ссылки на agent-sdk в package.json. */
const agentVersion = async () => {
  if (process.env.AGENT_VERSION) return process.env.AGENT_VERSION;
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const found = /agent-sdk-([^/]+)\.tgz$/.exec(pkg.dependencies?.["agent-sdk"] ?? "");

  if (!found) throw new Error("Не понять версию agent-sdk — укажите AGENT_VERSION=...");

  return found[1];
};

const sha256 = buf => createHash("sha256").update(buf).digest("hex");

const download = async url => {
  const res = await fetch(url);

  if (!res.ok) throw new Error(`${url}: ${res.status}`);

  return Buffer.from(await res.arrayBuffer());
};

const readIfExists = file => readFile(file).catch(() => null);

const main = async () => {
  const version = await agentVersion();
  const base = process.env.AGENT_DIST_URL ?? `https://github.com/${REPO}/releases/download/v${version}`;
  const out = join(ROOT, "agent/dist", `v${version}`);
  const only = process.env.AGENT_PLATFORMS?.split(/\s+/).filter(Boolean);

  await mkdir(out, { recursive: true });
  const manifestRaw = await download(`${base}/manifest.json`);
  const manifest = JSON.parse(manifestRaw.toString("utf8"));

  if (manifest.version !== version) {
    throw new Error(`в ${base} версия ${manifest.version}, ожидалась ${version}`);
  }
  const builds = [...manifest.artifacts, ...(manifest.workers ?? [])].filter(
    b => !only || only.includes(`${b.os}-${b.arch}`),
  );

  for (const b of builds) {
    const file = join(out, b.file);
    const have = await readIfExists(file);

    if (have && sha256(have) === b.sha256) continue;
    const body = await download(`${base}/${encodeURIComponent(b.file)}`);

    if (sha256(body) !== b.sha256) throw new Error(`${b.file}: sha256 не совпадает с manifest.json`);
    await writeFile(`${file}.new`, body);
    await chmod(`${file}.new`, 0o755);
    await rename(`${file}.new`, file);
    process.stderr.write(`${b.file}\n`);
  }
  await writeFile(join(out, "install.sh"), await download(`${base}/install.sh`), { mode: 0o755 });
  await writeFile(join(out, "manifest.json"), manifestRaw);
  process.stdout.write(`${out}\n`);
};

main().catch(err => {
  process.stderr.write(`agent:fetch: ${err.message}\n`);
  process.exit(1);
});
