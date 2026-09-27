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

/** Вебхук отключён автоматически после серии проваленных доставок. */
export class BotWebhookDisabledEvent {
  constructor(
    public readonly botId: string,
    public readonly ownerId: string,
    public readonly failureCount: number,
    public readonly lastError: string | null,
  ) {}
}
