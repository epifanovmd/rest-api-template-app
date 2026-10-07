import { createReadStream, promises as fs } from "fs";
import { join } from "path";
import type { Readable } from "stream";

import { Injectable, logger } from "../../core";
import { agentConfig } from "./agent.config";
import { AgentError } from "./agent.errors";

/** Сборка агента под ОС и архитектуру. */
export interface IAgentArtifact {
  os: string;
  arch: string;
  file: string;
  sha256: string;
  /** Подпись Ed25519 над sha256 (base64); без неё самообновление невозможно. */
  signature?: string;
}

/** Выпуск агента: `manifest.json` в каталоге версии (`agent release-manifest`). */
export interface IAgentRelease {
  version: string;
  artifacts: IAgentArtifact[];
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/;

/** Сравнение semver без пререлизов (их порядок — по строке). */
const compareVersions = (a: string, b: string): number => {
  const pa = a.split(/[.+-]/).map(Number);
  const pb = b.split(/[.+-]/).map(Number);

  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }

  return a.localeCompare(b);
};

/**
 * Сборки агента из `AGENT_RELEASES_DIR`: `<version>/manifest.json` и
 * файлы `agent-<os>-<arch>` (скрипт `scripts/agent.sh release`).
 */
@Injectable()
export class AgentReleaseService {
  /** Выпуски, новые первыми. */
  async list(): Promise<IAgentRelease[]> {
    let dirs: string[];

    try {
      dirs = await fs.readdir(agentConfig.releasesDir);
    } catch {
      return [];
    }

    const releases: IAgentRelease[] = [];

    for (const dir of dirs.filter(name => VERSION_RE.test(name))) {
      try {
        const raw = await fs.readFile(
          join(agentConfig.releasesDir, dir, "manifest.json"),
          "utf8",
        );

        releases.push(JSON.parse(raw) as IAgentRelease);
      } catch (err) {
        logger.warn(
          { err, version: dir },
          "[Agent] manifest выпуска не прочитан",
        );
      }
    }

    return releases.sort((a, b) => compareVersions(b.version, a.version));
  }

  /** Сборка версии (по умолчанию — последней) под ОС и архитектуру. */
  async artifact(
    os: string,
    arch: string,
    version?: string,
  ): Promise<{ release: IAgentRelease; artifact: IAgentArtifact }> {
    const releases = await this.list();
    const release = version
      ? releases.find(r => r.version === version)
      : releases[0];
    const artifact = release?.artifacts.find(
      a => a.os === os && a.arch === arch,
    );

    if (!release || !artifact) {
      throw AgentError.RELEASE_NOT_FOUND({ version, os, arch });
    }

    return { release, artifact };
  }

  /** Поток файла сборки. */
  async open(version: string, os: string, arch: string): Promise<Readable> {
    if (!VERSION_RE.test(version)) throw AgentError.RELEASE_NOT_FOUND();

    const { artifact } = await this.artifact(os, arch, version);

    return createReadStream(
      join(agentConfig.releasesDir, version, artifact.file),
    );
  }
}
