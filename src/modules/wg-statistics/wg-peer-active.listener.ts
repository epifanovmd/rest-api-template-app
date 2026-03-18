import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { WgPeerActiveChangedEvent } from "../wg-peer/events";

/**
 * Broadcasts peer connection activity changes to Socket.IO room wg:peer:{id}
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
          lastHandshake: event.lastHandshake,
        });
      },
    );
  }
}
