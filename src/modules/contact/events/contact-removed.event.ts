export class ContactRemovedEvent {
  constructor(
    public readonly userId: string,
    public readonly contactUserId: string,
    public readonly contactId: string,
  ) {}
}
