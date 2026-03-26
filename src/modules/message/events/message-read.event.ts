export class MessageReadEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly messageId: string,
  ) {}
}
