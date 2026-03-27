import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener } from "../socket";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import {
  EmailVerifiedEvent,
  PasswordChangedEvent,
  UserDeletedEvent,
  UsernameChangedEvent,
  UserPrivilegesChangedEvent,
} from "./events";

@Injectable()
export class UserListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(
      EmailVerifiedEvent,
      (event: EmailVerifiedEvent) => {
        this._emitter.toUser(event.userId, "user:email-verified", {
          verified: true,
        });
      },
    );

    this._eventBus.on(
      UserDeletedEvent,
      (event: UserDeletedEvent) => {
        this._emitter.toUser(event.userId, "session:terminated", {
          sessionId: "all",
        });
      },
    );

    this._eventBus.on(
      PasswordChangedEvent,
      (event: PasswordChangedEvent) => {
        this._emitter.toUser(event.userId, "user:password-changed", {
          userId: event.userId,
          method: event.method,
        });

        // Завершаем все остальные сессии пользователя
        this._emitter.toUser(event.userId, "session:terminated", {
          sessionId: "*",
        });
      },
    );

    this._eventBus.on(
      UserPrivilegesChangedEvent,
      (event: UserPrivilegesChangedEvent) => {
        this._emitter.toUser(event.userId, "user:privileges-changed", {
          roles: event.roles,
          permissions: event.permissions,
        });
      },
    );

    this._eventBus.on(
      UsernameChangedEvent,
      (event: UsernameChangedEvent) => {
        this._emitter.toUser(event.userId, "user:username-changed", {
          userId: event.userId,
          username: event.username,
        });
      },
    );
  }
}
