/** Участник удалён из пространства или вышел сам (`actorId === userId`). */
export class WorkspaceMemberRemovedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly actorId: string | null,
  ) {}
}
