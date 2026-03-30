import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import {
  TwoFactorDisabledEvent,
  TwoFactorEnabledEvent,
  UserLoggedInEvent,
} from "./events";

@Injectable()
export class AuthListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(UserLoggedInEvent, (event: UserLoggedInEvent) => {
      this._emitter.toUser(event.userId, "session:new", {
        sessionId: event.sessionId ?? "",
      });
    });

    this._eventBus.on(TwoFactorEnabledEvent, (event: TwoFactorEnabledEvent) => {
      this._emitter.toUser(event.userId, "auth:2fa-changed", {
        enabled: true,
      });
    });

    this._eventBus.on(
      TwoFactorDisabledEvent,
      (event: TwoFactorDisabledEvent) => {
        this._emitter.toUser(event.userId, "auth:2fa-changed", {
          enabled: false,
        });
      },
    );
  }
}
