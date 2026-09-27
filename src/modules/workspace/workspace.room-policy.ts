import { inject } from "inversify";

import { Injectable } from "../../core";
import type { ISocketRoomPolicy } from "../socket";
import { WORKSPACE_SCOPE, workspaceRoom } from "./workspace.types";
import { WorkspaceAccessService } from "./workspace-access.service";

/** `room:subscribe { type: "workspace", id }` — только участникам. */
@Injectable()
export class WorkspaceRoomPolicy implements ISocketRoomPolicy {
  readonly type = WORKSPACE_SCOPE;

  constructor(
    @inject(WorkspaceAccessService)
    private readonly _access: WorkspaceAccessService,
  ) {}

  room(id: string): string {
    return workspaceRoom(id);
  }

  canJoin(userId: string, id: string): Promise<boolean> {
    return this._access.isMember(userId, id);
  }
}
