/** Пространство удалено; `memberUserIds` — состав на момент удаления. */
export class WorkspaceDeletedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly memberUserIds: string[],
    public readonly actorId: string | null,
  ) {}
}
