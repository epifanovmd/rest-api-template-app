import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { SocketServerService } from "../socket/socket-server.service";
import { WgServerStatusChangedEvent } from "../wg-server/events";
import { EWgServerStatus } from "../wg-server/wg-server.types";

/**
 * Broadcasts server status changes to Socket.IO room wg:server:{id}
 */
@Injectable()
export class WgServerStatusListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketServerService)
    private readonly server: SocketServerService,
  ) {}

  register(): void {
    this.eventBus.on(
      WgServerStatusChangedEvent,
      (event: WgServerStatusChangedEvent) => {
        const now = new Date();

        this.server.io
          .to(`wg:server:${event.serverId}`)
          .emit("wg:server:status", {
            serverId: event.serverId,
            interface: event.interfaceName,
            status: event.status,
            listenPort: 0,
            peerCount: 0,
            activePeerCount: 0,
            timestamp: now,
          });
      },
    );
  }
}
