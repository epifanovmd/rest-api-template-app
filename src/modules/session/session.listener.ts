import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import {
  PasswordChangedEvent,
  UserPrivilegesChangedEvent,
} from "../user/events";
import { SessionTerminatedEvent } from "./events";
import { SessionService } from "./session.service";

@Injectable()
export class SessionListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(SessionService)
    private readonly _sessionService: SessionService,
  ) {}

  register(): void {
    this._eventBus.on(
      SessionTerminatedEvent,
      (event: SessionTerminatedEvent) => {
        this._emitter.toUser(event.userId, "session:terminated", {
          sessionId: event.sessionId,
        });
      },
    );

    this._eventBus.on(
      PasswordChangedEvent,
      (event: PasswordChangedEvent) => {
        this._sessionService.terminateAllByUser(event.userId);
      },
    );

    this._eventBus.on(
      UserPrivilegesChangedEvent,
      (event: UserPrivilegesChangedEvent) => {
        this._sessionService.terminateAllByUser(event.userId);
      },
    );
  }
}
