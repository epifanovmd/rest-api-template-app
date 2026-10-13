import type { AgentInstallMode } from "../agent.types";

/** Откуда сборка: `local` — каталог сборок воркеров проекта. */
export type TAgentReleaseSource = "local";

/** Сборка в каталоге сборок. */
export interface IAgentReleaseArtifactDto {
  os: string;
  arch: string;
  file: string;
  sha256: string;
  signature?: string;
  source: TAgentReleaseSource;
  /** Путь от корня бэкенда. */
  url: string;
}

/** Сборка воркера. */
export interface IAgentWorkerArtifactDto extends IAgentReleaseArtifactDto {
  name: string;
  version: string;
  /** Что запускать в сборке-архиве. */
  command?: string;
  stopTimeout?: string;
}

/**
 * Сборки, которые раздаёт бэкенд: воркеры проекта — из `release/` каталога
 * архивов `AGENT_BUNDLE_DIR` (`manifest.json` от `agent pack --release-out`).
 */
export interface IAgentReleaseManifestDto {
  version: string;
  /** Ключ, которым подписаны сборки (base64). */
  publicKey?: string;
  artifacts: IAgentReleaseArtifactDto[];
  workers?: IAgentWorkerArtifactDto[];
}

/** Откуда новая версия агента: `agent` — агент нашёл её в своём каталоге сборок сам. */
export type TAgentUpdateSource = "agent";

/** Агент, которого можно обновить до новой версии. */
export interface IAgentUpdateCandidateDto {
  agentId: string;
  name: string;
  online: boolean;
  current: string;
  target: string;
  os: string;
  arch: string;
  source: TAgentUpdateSource;
}

/** Воркер со сборкой с сервера, которого можно обновить. */
export interface IAgentWorkerUpdateCandidateDto {
  agentId: string;
  agentName: string;
  online: boolean;
  worker: string;
  current: string;
  target: string;
  os: string;
  arch: string;
}

/** Сборки агента и кого можно обновить. */
export interface IAgentReleaseDto {
  /** `null` — нет каталога сборок воркеров. */
  manifest: IAgentReleaseManifestDto | null;
  candidates: IAgentUpdateCandidateDto[];
  workerCandidates: IAgentWorkerUpdateCandidateDto[];
}

/** Команда установки агента на узел: архив папки агента с этого сервера и токен. */
export interface ICreateAgentInstallCommandBody {
  /** Токен регистрации; ровно одно из `token` и `tokenFile`. */
  token?: string;
  /** Путь к файлу с токеном на узле. */
  tokenFile?: string;
  /** Адрес сервера; без него — `AGENT_PUBLIC_URL` или `APP_PUBLIC_URL`. */
  baseUrl?: string;
  /**
   * Способ установки: `systemd` (по умолчанию) — служба от root, `rootless` —
   * агент пользователя без root, `run` — без установки, агент на переднем плане
   * (контейнер); `rootless` и `run` — команда без sudo.
   */
  mode?: AgentInstallMode;
}

export interface IAgentInstallCommandDto {
  /** `curl …/api/v1/agent-link/bundle/install.sh | sudo sh -s -- --token …` (`rootless`, `run` — без sudo). */
  command: string;
}
