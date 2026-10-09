import { inject } from "inversify";
import { isDeepStrictEqual } from "util";

import { Injectable, logger } from "../../core";
import type { AuthContext } from "../../types/koa";
import { AgentDto, AgentService, AgentWorkerService } from "../agent";
import type { INodeMeshCellDto, INodeMeshDto } from "./dto";
import { NodeAccess } from "./node.access";
import { NodeError } from "./node.errors";
import { NodePermissions } from "./node.permissions";
import { NodeRepository, TNodeProbeRow } from "./node.repository";
import { NETPROBE, NETPROBE_WORKER } from "./node.types";

/** Цель проверки воркера `netprobe`: `id` — id узла. */
export interface INetprobeTarget {
  id: string;
  host: string;
  port?: number;
  method: "icmp" | "tcp";
}

/** Настройка `targets` воркера `netprobe`. */
export interface INetprobeSpec {
  targets: INetprobeTarget[];
  intervalSec: number;
  count: number;
  timeoutMs: number;
}

type TRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const numOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Цели узла для воркера `netprobe`: остальные узлы с адресом. Id цели — id
 * узла: так проверяются и узлы без агента.
 */
export const netprobeSpec = (
  nodeId: string,
  nodes: TNodeProbeRow[],
): INetprobeSpec => ({
  targets: nodes.flatMap(node =>
    node.id !== nodeId && node.host
      ? [{ id: node.id, host: node.host, method: NETPROBE.method }]
      : [],
  ),
  intervalSec: NETPROBE.intervalSec,
  count: NETPROBE.count,
  timeoutMs: NETPROBE.timeoutMs,
});

/** У агента есть воркер `netprobe`. */
export const hasNetprobe = (agent: Pick<AgentDto, "workers">): boolean =>
  agent.workers.some(worker => worker.name === NETPROBE_WORKER);

/** Итог последнего круга `netprobe` из точки метрик агента; нет — `null`. */
export const netprobeReport = (
  workers: Record<string, unknown> | undefined,
): { at: number; results: TRecord[] } | null => {
  const report = workers?.[NETPROBE_WORKER];

  if (!isRecord(report) || typeof report.at !== "number") return null;

  return {
    at: report.at,
    results: Array.isArray(report.results)
      ? report.results.filter(isRecord)
      : [],
  };
};

/**
 * Ячейки матрицы по последним метрикам агентов узлов: «узел агента → узел
 * цели» (id цели — id узла). Ячейки вне списка узлов и на себя
 * отбрасываются; итог старше `staleMs` или агент без связи — `stale`.
 */
export const nodeMeshCells = (
  nodes: TNodeProbeRow[],
  agents: Map<string, AgentDto>,
  now: number,
): INodeMeshCellDto[] => {
  const known = new Set(nodes.map(node => node.id));

  return nodes.flatMap(node => {
    const agent = node.agentId ? agents.get(node.agentId) : undefined;
    const report = netprobeReport(agent?.metrics?.workers);

    if (!agent || !report) return [];

    const stale = !agent.online || now - report.at > NETPROBE.staleMs;

    return report.results.flatMap(result => {
      const to = String(result.id ?? "");

      if (!known.has(to) || to === node.id) return [];

      return [
        {
          from: node.id,
          to,
          method: String(result.method ?? NETPROBE.method),
          ...(typeof result.via === "string" && { via: result.via }),
          sent: numOrNull(result.sent) ?? 0,
          received: numOrNull(result.received) ?? 0,
          lossPct: numOrNull(result.lossPct) ?? 100,
          rttAvgMs: numOrNull(result.rttAvgMs),
          rttMinMs: numOrNull(result.rttMinMs),
          rttMaxMs: numOrNull(result.rttMaxMs),
          at: report.at,
          stale,
          ...(typeof result.error === "string" &&
            result.error && { error: result.error }),
        },
      ];
    });
  });
};

/** Матрица только по узлам из набора: узлы и ячейки, где оба конца в нём. */
export const meshOf = (
  mesh: INodeMeshDto,
  nodeIds: ReadonlySet<string>,
): INodeMeshDto => ({
  nodes: mesh.nodes.filter(node => nodeIds.has(node.id)),
  cells: mesh.cells.filter(
    cell => nodeIds.has(cell.from) && nodeIds.has(cell.to),
  ),
  generatedAt: mesh.generatedAt,
});

/**
 * Связность узлов. Агенту каждого узла с воркером `netprobe` задаётся
 * настройка `targets` (остальные узлы с адресом); воркер присылает итоги
 * кругов в своих метриках, матрицу модуль собирает по последней точке
 * метрик агентов.
 */
@Injectable()
export class NodeMeshService {
  constructor(
    @inject(NodeRepository) private readonly _nodes: NodeRepository,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentWorkerService) private readonly _workers: AgentWorkerService,
  ) {}

  /**
   * Задать агентам узлов цели проверки. Новая версия настройки — только при
   * другом содержимом.
   */
  async syncTargets(): Promise<number> {
    const nodes = await this._nodes.findForProbe();
    let changed = 0;

    for (const node of nodes) {
      if (!node.agentId) continue;

      try {
        const agent = await this._agents.find(node.agentId);

        if (!agent || agent.revoked || !hasNetprobe(agent)) continue;

        const spec = netprobeSpec(node.id, nodes);
        const current = await this._workers.findConfig(
          node.agentId,
          NETPROBE_WORKER,
          NETPROBE.configKey,
        );

        if (isDeepStrictEqual(current?.data, spec)) continue;

        await this._workers.putConfig(
          node.agentId,
          NETPROBE_WORKER,
          NETPROBE.configKey,
          spec,
        );
        changed += 1;
      } catch (err) {
        logger.warn(
          { err, nodeId: node.id, agentId: node.agentId },
          "[Node] Цели проверки сети не заданы",
        );
      }
    }

    return changed;
  }

  /** Матрица в области просмотра: все узлы или свои; права нет — 403. */
  async matrixFor(actor: AuthContext): Promise<INodeMeshDto> {
    const filter = NodeAccess.filter(actor, NodePermissions.VIEW);

    if (!filter) throw NodeError.FORBIDDEN();
    if (!filter.ownedBy) return this.matrix();

    const own = await this._nodes.findOptions(filter.ownedBy);

    return this.matrix(own.map(node => node.id));
  }

  /**
   * Матрица по своим узлам каждого владельца и создателя узлов матрицы:
   * пользователь → матрица его узлов.
   */
  async byOwner(mesh: INodeMeshDto): Promise<Map<string, INodeMeshDto>> {
    const rows = await this._nodes.findOwners(mesh.nodes.map(node => node.id));
    const own = new Map<string, Set<string>>();

    for (const row of rows) {
      for (const userId of new Set([row.ownerId, row.createdById])) {
        if (!userId) continue;

        const ids = own.get(userId) ?? new Set<string>();

        ids.add(row.id);
        own.set(userId, ids);
      }
    }

    return new Map(
      [...own].map(([userId, ids]) => [userId, meshOf(mesh, ids)]),
    );
  }

  /** Матрица по узлам из списка (без него — по всем). */
  async matrix(nodeIds?: string[]): Promise<INodeMeshDto> {
    const now = Date.now();
    const nodes = await this._nodes.findForProbe(nodeIds);
    const agents = new Map(
      (
        await Promise.all(
          nodes.map(node =>
            node.agentId ? this._agents.find(node.agentId) : null,
          ),
        )
      )
        .filter((agent): agent is AgentDto => agent !== null)
        .map(agent => [agent.id, agent]),
    );

    return {
      nodes: nodes.map(node => ({
        id: node.id,
        name: node.name,
        host: node.host,
      })),
      cells: nodeMeshCells(nodes, agents, now),
      generatedAt: now,
    };
  }
}
