import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener } from "../socket";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ContactAcceptedEvent, ContactRequestEvent } from "./events";

@Injectable()
export class ContactListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(
      ContactRequestEvent,
      (event: ContactRequestEvent) => {
        this._emitter.toUser(
          event.targetUserId,
          "contact:request",
          event.contact,
        );
      },
    );

    this._eventBus.on(
      ContactAcceptedEvent,
      (event: ContactAcceptedEvent) => {
        this._emitter.toUser(
          event.requesterId,
          "contact:accepted",
          event.contact,
        );
      },
    );
  }
}
