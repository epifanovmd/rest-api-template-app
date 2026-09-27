export class ChatSlowModeEvent {
  constructor(
    public readonly chatId: string,
    public readonly seconds: number,
    public readonly userId: string,
  ) {}
}

export class ChatMemberBannedEvent {
  constructor(
    public readonly chatId: string,
    public readonly targetUserId: string,
    public readonly bannedByUserId: string,
    public readonly duration?: number,
    public readonly reason?: string,
  ) {}
}

export class ChatMemberUnbannedEvent {
  constructor(
    public readonly chatId: string,
    public readonly targetUserId: string,
    public readonly unbannedByUserId: string,
  ) {}
}
