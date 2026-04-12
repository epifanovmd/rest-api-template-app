export class MessageReadEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly messageIds: string[],
  ) {}
}
