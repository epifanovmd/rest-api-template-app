import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { CallDto } from "./dto";
import {
  CallAnsweredEvent,
  CallDeclinedEvent,
  CallEndedEvent,
  CallInitiatedEvent,
  CallMissedEvent,
} from "./events";

@Injectable()
export class CallListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(
      CallInitiatedEvent,
      (event: CallInitiatedEvent) => {
        const dto = CallDto.fromEntity(event.call);

        this._emitter.toUser(event.call.calleeId, "call:incoming", dto);
      },
    );

    this._eventBus.on(
      CallAnsweredEvent,
      (event: CallAnsweredEvent) => {
        const dto = CallDto.fromEntity(event.call);

        this._emitter.toUser(event.call.callerId, "call:answered", dto);
      },
    );

    this._eventBus.on(
      CallDeclinedEvent,
      (event: CallDeclinedEvent) => {
        const dto = CallDto.fromEntity(event.call);

        this._emitter.toUser(event.call.callerId, "call:declined", dto);
      },
    );

    this._eventBus.on(CallEndedEvent, (event: CallEndedEvent) => {
      const dto = CallDto.fromEntity(event.call);

      this._emitter.toUser(event.call.callerId, "call:ended", dto);
      this._emitter.toUser(event.call.calleeId, "call:ended", dto);
    });

    this._eventBus.on(CallMissedEvent, (event: CallMissedEvent) => {
      const dto = CallDto.fromEntity(event.call);

      this._emitter.toUser(event.call.calleeId, "call:missed", dto);
    });
  }
}
