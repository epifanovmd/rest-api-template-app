import { inject } from "inversify";

import { isUuid } from "../../common";
import { AccessService, Injectable } from "../../core";
import { ISocketRoomPolicy } from "../socket";
import { NodeAccess } from "./node.access";
import { NodePermissions } from "./node.permissions";
import { NodeRepository } from "./node.repository";
import { NODE_ROOM_TYPE, nodeRoom } from "./node.types";

/**
 * Комната узла `node_<id>` (`room:subscribe { type: "node", id }`):
 * изменения узла и его задач. Право на все узлы или свой узел (владелец или
 * создатель) с правом `node:view:own`.
 */
@Injectable()
export class NodeRoomPolicy implements ISocketRoomPolicy {
  readonly type = NODE_ROOM_TYPE;

  constructor(
    @inject(AccessService) private readonly _access: AccessService,
    @inject(NodeRepository) private readonly _nodes: NodeRepository,
  ) {}

  room(id: string): string {
    return nodeRoom(id);
  }

  async canJoin(userId: string, id: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    const scope = await this._access.scope(userId, NodePermissions.VIEW);

    if (scope === "all") return !!(await this._nodes.findById(id));
    if (scope !== "own") return false;

    const node = await this._nodes.findById(id);

    return node !== null && NodeAccess.isOwn(userId, node);
  }
}
