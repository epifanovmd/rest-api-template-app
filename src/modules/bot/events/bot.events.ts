export class BotCreatedEvent {
  constructor(
    public readonly botId: string,
    public readonly ownerId: string,
  ) {}
}

export class BotUpdatedEvent {
  constructor(
    public readonly botId: string,
    public readonly ownerId: string,
  ) {}
}

export class BotDeletedEvent {
  constructor(
    public readonly botId: string,
    public readonly ownerId: string,
  ) {}
}
