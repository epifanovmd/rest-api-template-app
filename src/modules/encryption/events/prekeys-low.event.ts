export class PrekeysLowEvent {
  constructor(
    public readonly userId: string,
    public readonly remainingCount: number,
  ) {}
}
