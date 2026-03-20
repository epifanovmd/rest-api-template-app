import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketEmitterService } from "../socket/socket-emitter.service";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import {
  WgOverviewStatsUpdatedEvent,
  WgPeerStatsUpdatedEvent,
  WgServerStatsUpdatedEvent,
} from "./events";

/**
 * Listens for stats events from EventBus and broadcasts
 * real-time data to subscribed Socket.IO rooms.
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
    this.eventBus.on(WgOverviewStatsUpdatedEvent, ({ overview }) => {
      this.emitter.toRoom("wg:overview", "wg:stats:overview", overview);
    });

    this.eventBus.on(WgServerStatsUpdatedEvent, ({ server }) => {
      this.emitter.toRoom(`wg:server:${server.serverId}`, "wg:server:stats", server);
    });

    this.eventBus.on(WgPeerStatsUpdatedEvent, ({ peer }) => {
      this.emitter.toRoom(`wg:peer:${peer.peerId}`, "wg:peer:stats", peer);
    });
  }
}
