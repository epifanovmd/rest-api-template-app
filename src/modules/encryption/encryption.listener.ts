import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { DeviceRevokedEvent, PrekeysLowEvent } from "./events";

@Injectable()
export class EncryptionListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(PrekeysLowEvent, (event: PrekeysLowEvent) => {
      this._emitter.toUser(event.userId, "e2e:prekeys-low", {
        count: event.remainingCount,
      });
    });

    this._eventBus.on(
      DeviceRevokedEvent,
      (event: DeviceRevokedEvent) => {
        this._emitter.toUser(event.userId, "e2e:device-revoked", {
          deviceId: event.deviceId,
        });
      },
    );
  }
}
