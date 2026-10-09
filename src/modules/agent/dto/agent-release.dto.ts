/**
 * Откуда сборка: `remote` — источник выпусков агента (GitHub или ссылка),
 * `local` — каталог выпуска воркеров проекта.
 */
export type TAgentReleaseSource = "remote" | "local";

/** Сборка агента в выпуске. */
export interface IAgentReleaseArtifactDto {
  os: string;
  arch: string;
  file: string;
  sha256: string;
  signature?: string;
  source: TAgentReleaseSource;
  /** Ссылка источника или путь от корня бэкенда. */
  url: string;
}

/** Сборка воркера в выпуске. */
export interface IAgentWorkerArtifactDto extends IAgentReleaseArtifactDto {
  name: string;
  version: string;
  /** Что запускать в сборке-архиве. */
  command?: string;
  stopTimeout?: string;
}

/** Выпуск агента в источнике: версия, откуда, когда проверен. */
export interface IAgentReleaseRemoteDto {
  version: string;
  /** `github:owner/repo` или ссылка на каталог выпуска. */
  from: string;
  /** Время проверки, мс. */
  checkedAt: number;
  /** Ключ, которым подписан выпуск (base64). */
  publicKey?: string;
}

/**
 * Выпуск, который раздаёт бэкенд: агент и netprobe — из источника выпусков
 * агента, воркеры проекта — из `AGENT_RELEASES_DIR`.
 */
export interface IAgentReleaseManifestDto {
  version: string;
  /** Ключ, которым подписан выпуск (base64). */
  publicKey?: string;
  artifacts: IAgentReleaseArtifactDto[];
  workers?: IAgentWorkerArtifactDto[];
  /** Нет — источник выпусков агента не задан или ещё не ответил. */
  remote?: IAgentReleaseRemoteDto;
}

/** Другая версия агента в источнике выпусков (сокет `agent:release`). */
export interface IAgentReleaseChangeDto {
  version: string;
  /** Прежняя версия; нет — выпуск получен впервые. */
  previous?: string;
  /** `github:owner/repo` или ссылка на каталог выпуска. */
  from: string;
}

/** Агент, которого можно обновить до версии выпуска. */
export interface IAgentUpdateCandidateDto {
  agentId: string;
  name: string;
  online: boolean;
  current: string;
  target: string;
  os: string;
  arch: string;
}

/** Воркер из выпуска, которого можно обновить. */
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

/** Выпуск агента и кого можно обновить. */
export interface IAgentReleaseDto {
  /** `null` — нет ни источника выпусков агента, ни каталога выпуска. */
  manifest: IAgentReleaseManifestDto | null;
  candidates: IAgentUpdateCandidateDto[];
  workerCandidates: IAgentWorkerUpdateCandidateDto[];
}

/** Параметры команды установки агента на узел (флаги `install.sh`). */
export interface ICreateAgentInstallCommandBody {
  /** Токен регистрации; ровно одно из `token` и `tokenFile`. */
  token?: string;
  /** Путь к файлу с токеном на узле. */
  tokenFile?: string;
  /** Адрес сервера; без него — `AGENT_PUBLIC_URL` или `APP_PUBLIC_URL`. */
  baseUrl?: string;
  name?: string;
  /** Пользователь службы агента. */
  user?: string;
  /** Путь к `agent.yaml` на узле. */
  config?: string;
  privileged?: boolean;
  /** `process` | `mixed`. */
  killMode?: "process" | "mixed";
  packages?: string[];
  sysctl?: Record<string, string>;
  rwPaths?: string[];
  caFile?: string;
  /** Воркеры из выпуска. */
  workers?: string[];
  /** Например `30s`. */
  stopTimeout?: string;
  /** Другой источник сборок воркеров (`--releases`). */
  releases?: string;
}

export interface IAgentInstallCommandDto {
  /** `curl … | sudo sh -s -- …`. */
  command: string;
}
