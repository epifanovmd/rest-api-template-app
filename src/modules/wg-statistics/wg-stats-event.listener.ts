import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import {
  ISocketEventListener,
  SOCKET_EVENT_LISTENER,
} from "../socket/socket-event-listener.interface";
import { SocketServerService } from "../socket/socket-server.service";
import { WgStatsUpdatedEvent } from "./events";

/**
 * Listens for WgStatsUpdatedEvent from EventBus and broadcasts
 * real-time stats to subscribed Socket.IO rooms.
 *
 * Rooms:
 *   wg:overview         — overview stats (all admins)
 *   wg:server:{id}      — per-server stats
 *   wg:peer:{id}        — per-peer stats
 */
@Injectable()
export class WgStatsEventListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
    @inject(SocketServerService)
    private readonly server: SocketServerService,
  ) {}

  register(): void {
    this.eventBus.on(WgStatsUpdatedEvent, (event: WgStatsUpdatedEvent) => {
        this.server.io
          .to("wg:overview")
          .emit("wg:stats:overview", event.overview);

        for (const srv of event.servers) {
          this.server.io
            .to(`wg:server:${srv.serverId}`)
            .emit("wg:server:stats", srv);
        }

        for (const peer of event.peers) {
          this.server.io
            .to(`wg:peer:${peer.peerId}`)
            .emit("wg:peer:stats", peer);
        }
    });
  }
}
