export class MemberAddedEvent {
  constructor(
    public readonly dialogId: string,
    public readonly memberIds: string[],
  ) {}
}
