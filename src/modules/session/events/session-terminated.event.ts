export class SessionTerminatedEvent {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
  ) {}
}
