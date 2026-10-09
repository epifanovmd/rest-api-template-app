import { inject } from "inversify";

import { resolveScope } from "../../core";
import { Injectable } from "../../core";
import type { IAgentAccessPolicy, IAgentActor, TAgentAction } from "../agent";
import { NodeAccess } from "./node.access";
import { NodePermissions } from "./node.permissions";
import { NodeRepository } from "./node.repository";

/** Право узла, открывающее действие с его агентом. */
const NODE_PERMISSION: Record<TAgentAction, string> = {
  view: NodePermissions.VIEW,
  logs: NodePermissions.LOGS,
  manage: NodePermissions.AGENT,
  config: NodePermissions.AGENT,
  fetch: NodePermissions.AGENT,
};

/**
 * Доступ к агентам через узлы: агент узла доступен с правом узла на
 * действие (`node:view`, `node:logs`, `node:agent`) — на все узлы или на
 * свои (`:own`, владелец или создатель).
 */
@Injectable()
export class NodeAgentAccessPolicy implements IAgentAccessPolicy {
  constructor(
    @inject(NodeRepository) private readonly _nodes: NodeRepository,
  ) {}

  async canAccess(
    actor: IAgentActor,
    agentId: string,
    action: TAgentAction,
  ): Promise<boolean> {
    const scope = this._scope(actor, action);

    if (!scope) return false;

    const node = await this._nodes.findByAgentId(agentId);

    return (
      node !== null && (scope === "all" || NodeAccess.isOwn(actor.userId, node))
    );
  }

  async agentIds(actor: IAgentActor, action: TAgentAction): Promise<string[]> {
    const scope = this._scope(actor, action);

    if (!scope) return [];

    return this._nodes.findAgentIds(scope === "own" ? actor.userId : undefined);
  }

  private _scope(actor: IAgentActor, action: TAgentAction) {
    return resolveScope(
      actor.roles,
      actor.permissions,
      NODE_PERMISSION[action],
    );
  }
}
