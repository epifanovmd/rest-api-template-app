export class ChatArchivedEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly isArchived: boolean,
  ) {}
}
