import { inject } from "inversify";

import { Injectable } from "../../core";
import { AgentConfigStatusDto, AgentDto, AgentService } from "../agent";
import { JobRunDto, JobRunRepository } from "../jobs";
import { INodeView, NodeDto } from "./dto";
import { Node } from "./node.entity";
import { NODE_JOB_KINDS, NODE_JOB_SCOPE } from "./node.types";
import { configSummary, nodeStatus } from "./node-status";

/** Агентов меньше — читаются по одному, больше — списком. */
const AGENT_LIST_THRESHOLD = 3;

/**
 * Сборка DTO узлов: агент (agent-sdk), статусы настроек его воркеров,
 * кандидаты на обновление и последняя задача установки — пачкой на список,
 * затем вычисление статуса и сводки настроек.
 */
@Injectable()
export class NodeViewService {
  constructor(
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(JobRunRepository) private readonly _jobs: JobRunRepository,
  ) {}

  async toDto(node: Node): Promise<NodeDto> {
    const [dto] = await this.toDtos([node]);

    return dto;
  }

  async toDtos(nodes: Node[]): Promise<NodeDto[]> {
    if (nodes.length === 0) return [];

    const agentIds = nodes.flatMap(node =>
      node.agentId ? [node.agentId] : [],
    );
    const hasAgents = agentIds.length > 0;
    const [agents, configs, candidates, jobs] = await Promise.all([
      hasAgents ? this._loadAgents(agentIds) : new Map<string, AgentDto>(),
      this._loadConfigs(agentIds),
      hasAgents
        ? this._agents.updateCandidateIds()
        : Promise.resolve(new Set<string>()),
      this._jobs.findLatestByScopes(
        NODE_JOB_SCOPE,
        nodes.map(node => node.id),
        Object.keys(NODE_JOB_KINDS),
      ),
    ]);
    const jobByNode = new Map(
      jobs.map(run => [run.scopeId, JobRunDto.fromEntity(run)]),
    );

    return nodes.map(node => {
      const agent = node.agentId ? (agents.get(node.agentId) ?? null) : null;
      const run = jobByNode.get(node.id);
      const job = run ? { run, kind: NODE_JOB_KINDS[run.queue] } : null;
      const agentConfigs = agent ? (configs.get(agent.id) ?? []) : [];
      const view: INodeView = {
        agent,
        updateAvailable: !!agent && candidates.has(agent.id),
        job,
        status: nodeStatus(
          agent,
          job && {
            kind: job.kind,
            status: job.run.status,
            progressText: job.run.progressText,
            error: job.run.error,
          },
          agentConfigs,
        ),
        config: configSummary(agent, agentConfigs),
      };

      return NodeDto.fromEntity(node, view);
    });
  }

  /** Статусы настроек агентов; не прочитались — пусто (узел без сводки). */
  private async _loadConfigs(
    ids: string[],
  ): Promise<Map<string, AgentConfigStatusDto[]>> {
    const entries = await Promise.all(
      ids.map(async id => {
        const configs = await this._agents.configStatus(id).catch(() => []);

        return [id, configs] as const;
      }),
    );

    return new Map(entries);
  }

  private async _loadAgents(ids: string[]): Promise<Map<string, AgentDto>> {
    const agents =
      ids.length <= AGENT_LIST_THRESHOLD
        ? (await Promise.all(ids.map(id => this._agents.find(id)))).filter(
            (agent): agent is AgentDto => agent !== null,
          )
        : await this._agents.all();

    return new Map(agents.map(agent => [agent.id, agent]));
  }
}
