/** Сборка агента в выпуске. */
export interface IAgentReleaseArtifactDto {
  os: string;
  arch: string;
  file: string;
  sha256: string;
  signature?: string;
}

/** Сборка воркера в выпуске. */
export interface IAgentWorkerArtifactDto extends IAgentReleaseArtifactDto {
  name: string;
  version: string;
  /** Что запускать в сборке-архиве. */
  command?: string;
  stopTimeout?: string;
}

/** Манифест каталога выпуска. */
export interface IAgentReleaseManifestDto {
  version: string;
  artifacts: IAgentReleaseArtifactDto[];
  workers?: IAgentWorkerArtifactDto[];
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
  /** `null` — каталог выпуска не задан или пуст. */
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
