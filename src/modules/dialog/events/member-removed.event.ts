export class MemberRemovedEvent {
  constructor(
    public readonly dialogId: string,
    public readonly memberId: string,
  ) {}
}
