import { inject } from "inversify";

import { AccessService, Injectable } from "../../core";
import { ISocketRoomPolicy } from "../socket";
import { AgentPermissions } from "./agent.permissions";

/** Комната списка агентов: право `agent:view`. */
export const AGENTS_ROOM = "agents";

/** Комната агента `agent_<id>`: живое состояние и команды. */
export const agentRoom = (id: string): string => `agent_${id}`;

/** Комната одного агента: право `agent:view`. */
@Injectable()
export class AgentRoomPolicy implements ISocketRoomPolicy {
  readonly type = "agent";

  constructor(@inject(AccessService) private readonly _access: AccessService) {}

  room(id: string): string {
    return agentRoom(id);
  }

  canJoin(userId: string): Promise<boolean> {
    return this._access.can(userId, AgentPermissions.VIEW);
  }
}
