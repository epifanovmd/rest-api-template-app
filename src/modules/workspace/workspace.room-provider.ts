import { inject } from "inversify";

import { Injectable } from "../../core";
import type { ISocketRoomProvider } from "../socket";
import { workspaceRoom } from "./workspace.types";
import { WorkspaceMemberRepository } from "./workspace-member.repository";

/** При подключении сокет входит в комнаты всех своих пространств. */
@Injectable()
export class WorkspaceRoomProvider implements ISocketRoomProvider {
  constructor(
    @inject(WorkspaceMemberRepository)
    private readonly _members: WorkspaceMemberRepository,
  ) {}

  async rooms(userId: string): Promise<string[]> {
    const ids = await this._members.findWorkspaceIdsByUser(userId);

    return ids.map(workspaceRoom);
  }
}
