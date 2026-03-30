import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketContactRemovedPayload, ISocketEventListener } from "../socket";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import {
  ContactAcceptedEvent,
  ContactBlockedEvent,
  ContactRemovedEvent,
  ContactRequestEvent,
  ContactUnblockedEvent,
} from "./events";

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

    this._eventBus.on(
      ContactRemovedEvent,
      (event: ContactRemovedEvent) => {
        const payload: ISocketContactRemovedPayload = {
          contactId: event.contactId,
        };

        this._emitter.toUser(event.userId, "contact:removed", payload);
        this._emitter.toUser(event.contactUserId, "contact:removed", payload);
      },
    );

    this._eventBus.on(
      ContactBlockedEvent,
      (event: ContactBlockedEvent) => {
        this._emitter.toUser(
          event.blockedUserId,
          "contact:blocked",
          event.contact,
        );
      },
    );

    this._eventBus.on(
      ContactUnblockedEvent,
      (event: ContactUnblockedEvent) => {
        this._emitter.toUser(
          event.unblockedUserId,
          "contact:unblocked",
          event.contact,
        );
      },
    );
  }
}
