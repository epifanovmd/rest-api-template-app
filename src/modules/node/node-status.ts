import type { AgentConfigStatusDto, AgentDto } from "../agent";
import { EJobRunStatus } from "../jobs";
import { ENodeConfigStatus, ENodeJobKind, ENodeStatus } from "./node.types";

/** Последняя задача установки или удаления агента узла. */
export interface INodeJobState {
  kind: ENodeJobKind;
  status: EJobRunStatus;
  progressText: string | null;
  error: { code: string; message: string } | null;
}

export interface INodeStatusResult {
  status: ENodeStatus;
  /** Пояснение: что идёт, что не так. */
  message: string | null;
}

const JOB_TITLES: Record<ENodeJobKind, string> = {
  [ENodeJobKind.Install]: "Установка агента",
  [ENodeJobKind.Uninstall]: "Удаление агента",
};

const isActive = (job: INodeJobState): boolean =>
  job.status === EJobRunStatus.QUEUED || job.status === EJobRunStatus.RUNNING;

const isFailed = (job: INodeJobState): boolean =>
  job.status === EJobRunStatus.FAILED || job.status === EJobRunStatus.CANCELLED;

/**
 * Первая беда воркеров агента: не зарегистрирован (`invalid`), упал
 * (`backoff`, `stopped`), не в порядке (`health.ok: false`), отказал в
 * настройке. Встроенный `sysmetrics` тоже считается.
 */
export const workerFailure = (agent: AgentDto): string | null => {
  for (const worker of agent.workers) {
    if (worker.state === "invalid") {
      return `Воркер ${worker.name} не зарегистрирован: ${worker.message ?? "нет ответа на /health или /manifest"}`;
    }
    if (worker.state === "backoff" || worker.state === "stopped") {
      return `Воркер ${worker.name} не работает`;
    }
    if (worker.health && !worker.health.ok) {
      return `Воркер ${worker.name}: ${worker.health.message ?? "не в порядке"}`;
    }

    const failed = Object.entries(worker.configs ?? {}).find(
      ([, report]) => report.ok === false,
    );

    if (failed) {
      const [key, report] = failed;

      return `Воркер ${worker.name}, настройка ${key}: ${report.error?.message ?? "не применилась"}`;
    }
  }

  return null;
};

/**
 * Статус узла по агенту и последней задаче: идёт задача — `provisioning`;
 * агента нет — `error` после провала задачи, иначе `created`; агент не на
 * связи — `offline`; на связи, но с бедой воркеров или настроек — `error`;
 * иначе `online`.
 */
export const nodeStatus = (
  agent: AgentDto | null,
  job: INodeJobState | null,
  configs: AgentConfigStatusDto[] = [],
): INodeStatusResult => {
  if (job && isActive(job)) {
    return {
      status: ENodeStatus.Provisioning,
      message: job.progressText ?? JOB_TITLES[job.kind],
    };
  }

  if (!agent || agent.revoked) {
    if (job && isFailed(job)) {
      return {
        status: ENodeStatus.Error,
        message:
          job.error?.message ?? `${JOB_TITLES[job.kind]}: задача отменена`,
      };
    }

    return {
      status: ENodeStatus.Created,
      message: agent?.revoked ? "Агент отозван" : "Ожидает агента",
    };
  }

  if (!agent.online) return { status: ENodeStatus.Offline, message: null };

  const failure = workerFailure(agent);

  if (failure) return { status: ENodeStatus.Error, message: failure };

  const failedConfig = configs.find(config => config.state === "failed");

  if (failedConfig) {
    return {
      status: ENodeStatus.Error,
      message: `Настройка ${failedConfig.worker}/${failedConfig.key}: ${failedConfig.error?.message ?? failedConfig.error?.code ?? "не применилась"}`,
    };
  }

  return { status: ENodeStatus.Online, message: null };
};

/** Сводка настроек: состояние и ключи `воркер/ключ`, которые ждут или упали. */
export interface INodeConfigSummary {
  status: ENodeConfigStatus;
  /** Ключи, где заданная версия ещё не применена. */
  pending: string[];
  /** Ключи, где воркер отказал. */
  failed: string[];
}

/**
 * Сводка по статусам настроек агента: агента нет — `awaitingAgent`; отказ
 * хоть в одном ключе — `error`; есть неприменённые — `applying` (агент на
 * связи) или `awaitingAgent`; иначе `synced`.
 */
export const configSummary = (
  agent: AgentDto | null,
  configs: AgentConfigStatusDto[],
): INodeConfigSummary => {
  const name = (config: AgentConfigStatusDto) =>
    `${config.worker}/${config.key}`;
  const failed = configs.filter(c => c.state === "failed").map(name);
  const pending = configs
    .filter(c => c.state !== "failed" && c.state !== "applied")
    .map(name);

  if (!agent || agent.revoked) {
    return { status: ENodeConfigStatus.AwaitingAgent, pending, failed };
  }

  const status =
    failed.length > 0
      ? ENodeConfigStatus.Error
      : pending.length === 0
        ? ENodeConfigStatus.Synced
        : agent.online
          ? ENodeConfigStatus.Applying
          : ENodeConfigStatus.AwaitingAgent;

  return { status, pending, failed };
};
