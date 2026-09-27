export class ChatPinnedEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly isPinned: boolean,
  ) {}
}
