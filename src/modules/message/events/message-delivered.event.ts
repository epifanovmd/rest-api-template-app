export class MessageDeliveredEvent {
  constructor(
    public readonly messageIds: string[],
    public readonly chatId: string,
    public readonly userId: string,
  ) {}
}
