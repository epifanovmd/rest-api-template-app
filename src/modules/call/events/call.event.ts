import { Call } from "../call.entity";

export class CallInitiatedEvent {
  constructor(public readonly call: Call) {}
}

export class CallAnsweredEvent {
  constructor(public readonly call: Call) {}
}

export class CallDeclinedEvent {
  constructor(public readonly call: Call) {}
}

export class CallEndedEvent {
  constructor(public readonly call: Call) {}
}

export class CallMissedEvent {
  constructor(public readonly call: Call) {}
}
