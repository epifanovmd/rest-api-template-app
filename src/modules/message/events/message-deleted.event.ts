export class MessageDeletedEvent {
  constructor(
    public readonly messageId: string,
    public readonly chatId: string,
    public readonly forAll: boolean,
    public readonly userId: string,
  ) {}
}
