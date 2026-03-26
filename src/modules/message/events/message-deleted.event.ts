export class MessageDeletedEvent {
  constructor(
    public readonly messageId: string,
    public readonly chatId: string,
  ) {}
}
