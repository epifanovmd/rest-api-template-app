export class DialogCreatedEvent {
  constructor(
    public readonly dialogId: string,
    public readonly memberIds: string[],
  ) {}
}
