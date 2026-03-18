import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { WgPeerStatusChangedEvent } from "./events";

/**
 * Broadcasts peer DB status changes to Socket.IO room wg:peer:{id}
 */
@Injectable()
export class WgPeerStatusListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
  ) {}

  register(): void {
    this.eventBus.on(
      WgPeerStatusChangedEvent,
      (event: WgPeerStatusChangedEvent) => {
        this.emitter.toRoom(`wg:peer:${event.peerId}`, "wg:peer:status", {
          peerId: event.peerId,
          serverId: event.serverId,
          status: event.status,
          timestamp: new Date(),
        });
      },
    );
  }
}
