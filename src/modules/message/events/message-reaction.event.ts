export class MessageReactionEvent {
  constructor(
    public readonly messageId: string,
    public readonly chatId: string,
    public readonly userId: string,
    /** null means reaction was removed */
    public readonly emoji: string | null,
  ) {}
}
