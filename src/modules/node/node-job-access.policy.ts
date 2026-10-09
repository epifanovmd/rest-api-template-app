import { inject } from "inversify";

import {
  AccessService,
  IJobAccessPolicy,
  Injectable,
  JobAccessAction,
} from "../../core";
import { NodeAccess } from "./node.access";
import { NodePermissions } from "./node.permissions";
import { NodeRepository } from "./node.repository";
import { NODE_JOB_SCOPE } from "./node.types";

/**
 * Задачи узла (установка и удаление агента) видят все с правом просмотра
 * узла, отменяют — с правом установки, а не только тот, кто запустил. С
 * областью «свои» — только задачи своих узлов.
 */
@Injectable()
export class NodeJobAccessPolicy implements IJobAccessPolicy {
  readonly scopeType = NODE_JOB_SCOPE;

  constructor(
    @inject(AccessService) private readonly _access: AccessService,
    @inject(NodeRepository) private readonly _nodes: NodeRepository,
  ) {}

  async canAccess(
    userId: string,
    nodeId: string,
    action: JobAccessAction,
  ): Promise<boolean> {
    const scope = await this._access.scope(
      userId,
      action === "view" ? NodePermissions.VIEW : NodePermissions.PROVISION,
    );

    if (scope === "all") return true;
    if (scope !== "own") return false;

    const node = await this._nodes.findById(nodeId);

    return node !== null && NodeAccess.isOwn(userId, node);
  }
}
