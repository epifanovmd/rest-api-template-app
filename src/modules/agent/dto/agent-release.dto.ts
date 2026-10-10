/**
 * Откуда сборка: `remote` — откуда берутся сборки агента (GitHub или ссылка),
 * `local` — каталог сборок воркеров проекта.
 */
export type TAgentReleaseSource = "remote" | "local";

/** Сборка агента. */
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

/** Сборка воркера. */
export interface IAgentWorkerArtifactDto extends IAgentReleaseArtifactDto {
  name: string;
  version: string;
  /** Что запускать в сборке-архиве. */
  command?: string;
  stopTimeout?: string;
}

/** Версия агента в источнике: какая, откуда, когда проверена. */
export interface IAgentReleaseRemoteDto {
  version: string;
  /** `github:owner/repo` или ссылка на каталог сборок. */
  from: string;
  /** Время проверки, мс. */
  checkedAt: number;
  /** Ключ, которым подписаны сборки (base64). */
  publicKey?: string;
}

/**
 * Сборки, которые раздаёт бэкенд: агент и netprobe — из источника сборок
 * агента, воркеры проекта — из `release/` каталога архивов `AGENT_BUNDLE_DIR`.
 */
export interface IAgentReleaseManifestDto {
  version: string;
  /** Ключ, которым подписаны сборки (base64). */
  publicKey?: string;
  artifacts: IAgentReleaseArtifactDto[];
  workers?: IAgentWorkerArtifactDto[];
  /** Нет — источник сборок агента не задан или ещё не ответил. */
  remote?: IAgentReleaseRemoteDto;
}

/** Вышла другая версия агента (сокет `agent:release`). */
export interface IAgentReleaseChangeDto {
  version: string;
  /** Прежняя версия; нет — версия получена впервые. */
  previous?: string;
  /** `github:owner/repo` или ссылка на каталог сборок. */
  from: string;
}

/** Агент, которого можно обновить до новой версии. */
export interface IAgentUpdateCandidateDto {
  agentId: string;
  name: string;
  online: boolean;
  current: string;
  target: string;
  os: string;
  arch: string;
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
  /** `null` — нет ни источника сборок агента, ни каталога сборок воркеров. */
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
}

export interface IAgentInstallCommandDto {
  /** `curl …/api/v1/agent-bundle/install.sh | sudo sh -s -- --token …`. */
  command: string;
}
