import type { TWorkspaceRole } from "../workspace.types";

/** Пользователь стал участником (создал пространство, принял приглашение). */
export class WorkspaceMemberAddedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly role: TWorkspaceRole,
    /** Кто добавил; `null` — система. */
    public readonly actorId: string | null,
  ) {}
}
