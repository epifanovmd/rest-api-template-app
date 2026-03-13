export class MessageDeletedEvent {
  constructor(
    public readonly dialogId: string,
    public readonly messageId: string,
    public readonly memberIds: string[],
  ) {}
}
