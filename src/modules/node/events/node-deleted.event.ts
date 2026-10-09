/** Узел удалён. */
export class NodeDeletedEvent {
  constructor(
    public readonly nodeId: string,
    public readonly ownerId: string | null,
    public readonly createdById: string | null,
  ) {}
}
