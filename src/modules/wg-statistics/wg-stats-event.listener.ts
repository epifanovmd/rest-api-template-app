import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
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
  ) {}

  register(): void {
    this.eventBus.on(WgStatsUpdatedEvent, (event: WgStatsUpdatedEvent) => {
      this.emitter.toRoom("wg:overview", "wg:stats:overview", event.overview);

      for (const srv of event.servers) {
        this.emitter.toRoom(`wg:server:${srv.serverId}`, "wg:server:stats", srv);
      }

      for (const peer of event.peers) {
        this.emitter.toRoom(`wg:peer:${peer.peerId}`, "wg:peer:stats", peer);
      }
    });
  }
}
