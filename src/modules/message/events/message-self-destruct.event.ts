export class MessageSelfDestructStartedEvent {
  constructor(
    public readonly messageId: string,
    public readonly chatId: string,
    public readonly selfDestructAt: Date,
  ) {}
}
