/**
 * Узел изменён: поля, владелец, агент. `previousOwnerId` — прежний
 * владелец, если он сменился (для него узел может перестать быть своим).
 */
export class NodeUpdatedEvent {
  constructor(
    public readonly nodeId: string,
    public readonly previousOwnerId: string | null = null,
  ) {}
}
