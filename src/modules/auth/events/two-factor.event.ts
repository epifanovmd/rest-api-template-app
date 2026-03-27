export class TwoFactorEnabledEvent {
  constructor(public readonly userId: string) {}
}

export class TwoFactorDisabledEvent {
  constructor(public readonly userId: string) {}
}
