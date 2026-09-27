export class ChatMemberRoleChangedEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly role: string,
    public readonly changedBy: string,
  ) {}
}
