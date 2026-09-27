import type { TWorkspaceRole } from "../workspace.types";

/** Роль участника изменена, в том числе при передаче владения. */
export class WorkspaceMemberRoleChangedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly role: TWorkspaceRole,
    public readonly previousRole: TWorkspaceRole,
    public readonly actorId: string | null,
  ) {}
}
