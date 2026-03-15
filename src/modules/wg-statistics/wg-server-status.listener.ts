import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { WgServerStatusChangedEvent } from "../wg-server/events";

/**
 * Broadcasts server status changes to Socket.IO room wg:server:{id}
 */
@Injectable()
export class WgServerStatusListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
  ) {}

  register(): void {
    this.eventBus.on(
      WgServerStatusChangedEvent,
      (event: WgServerStatusChangedEvent) => {
        this.emitter.toRoom(`wg:server:${event.serverId}`, "wg:server:status", {
          serverId: event.serverId,
          interface: event.interfaceName,
          status: event.status,
          listenPort: 0,
          peerCount: 0,
          activePeerCount: 0,
          timestamp: new Date(),
        });
      },
    );
  }
}
