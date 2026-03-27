export class PasswordChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly method: "change" | "reset",
  ) {}
}
