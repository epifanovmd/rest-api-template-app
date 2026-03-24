import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { WgPeerActiveChangedEvent } from "../wg-peer/events";

/**
 * Рассылает изменения активности соединения пира в Socket.IO комнату wg:peer:{id}
 */
@Injectable()
export class WgPeerActiveListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
  ) {}

  register(): void {
    this.eventBus.on(
      WgPeerActiveChangedEvent,
      (event: WgPeerActiveChangedEvent) => {
        this.emitter.toRoom(`wg:peer:${event.peerId}`, "wg:peer:active", {
          peerId: event.peerId,
          serverId: event.serverId,
          isActive: event.isActive,
          lastHandshake: event.lastHandshake,
        });
      },
    );
  }
}
