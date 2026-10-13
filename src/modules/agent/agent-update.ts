import type { Agent, ReleaseView, WorkerArtifact } from "agent-sdk/server";

import type {
  IAgentUpdateCandidateDto,
  IAgentWorkerUpdateCandidateDto,
} from "./dto";

const parse = (version: string) => {
  const [core, pre = ""] = version.replace(/^v/, "").split("-", 2);

  return { parts: core.split(".").map(n => Number(n) || 0), pre };
};

/** Сравнение версий semver: > 0 — `a` новее `b`; пре-релиз младше релиза той же версии. */
export const compareVersions = (a: string, b: string): number => {
  const x = parse(a);
  const y = parse(b);
  const diff = [0, 1, 2]
    .map(i => (x.parts[i] ?? 0) - (y.parts[i] ?? 0))
    .find(d => d !== 0);

  if (diff !== undefined) return diff;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;

  return x.pre < y.pre ? -1 : 1;
};

/** Агент обновляет себя по команде сервера (`updateMode: self`; нет — агент старше 1.4). */
const isSelfUpdating = (agent: Agent): boolean =>
  (agent.hello?.agent.updateMode ?? "self") === "self";

/** Новейшая сборка воркера под платформу агента. */
const newestWorker = (
  release: ReleaseView,
  name: string,
  os: string,
  arch: string,
): WorkerArtifact | undefined => {
  let best: WorkerArtifact | undefined;

  for (const w of release.workers ?? []) {
    if (w.name !== name || w.os !== os || w.arch !== arch) continue;
    if (!best || compareVersions(w.version, best.version) > 0) best = w;
  }

  return best;
};

/** Кого можно обновить: агентов и воркеры со сборкой с сервера. */
export interface IUpdateCandidates {
  agents: IAgentUpdateCandidateDto[];
  workers: IAgentWorkerUpdateCandidateDto[];
}

/**
 * Кандидаты на обновление. Агент — до новой версии, которую он нашёл в своём
 * каталоге сборок сам (`update.latest`), если обновляет себя по команде
 * сервера. Воркер со сборкой с сервера (`release: true`) — до новейшей сборки
 * под платформу агента в каталоге сборок воркеров проекта (`release`), если
 * её версия другая.
 */
export const updateCandidates = (
  agents: Agent[],
  release: ReleaseView | null,
): IUpdateCandidates => {
  const out: IUpdateCandidates = { agents: [], workers: [] };

  for (const agent of agents) {
    if (agent.revoked || !agent.host || !agent.version) continue;
    const { os, arch } = agent.host;
    const latest = agent.update?.latest;

    if (
      latest &&
      isSelfUpdating(agent) &&
      compareVersions(latest, agent.version) > 0
    ) {
      out.agents.push({
        agentId: agent.id,
        name: agent.name,
        online: agent.online,
        current: agent.version,
        target: latest,
        os,
        arch,
        source: "agent",
      });
    }
    if (!release?.workers?.length) continue;
    for (const worker of agent.workers) {
      const build =
        worker.release && newestWorker(release, worker.name, os, arch);

      if (!build || compareVersions(worker.version ?? "", build.version) === 0)
        continue;
      out.workers.push({
        agentId: agent.id,
        agentName: agent.name,
        online: agent.online,
        worker: worker.name,
        current: worker.version ?? "",
        target: build.version,
        os,
        arch,
      });
    }
  }

  return out;
};
