import { inject } from "inversify";

import { Injectable } from "../../core";
import { TSocket } from "../socket/socket.types";
import {
  ISocketHandler,
  SOCKET_HANDLER,
} from "../socket/socket-handler.interface";
import { WgStatisticsService } from "./wg-statistics.service";

/**
 * Handles Socket.IO subscription events for WireGuard stats.
 *
 * Clients join named rooms to receive targeted updates:
 *   wg:overview         — overall VPN stats
 *   wg:server:{id}      — specific server stats + status
 *   wg:peer:{id}        — specific peer stats + status
 *
 * On subscribe, the current cached snapshot is immediately emitted
 * to the socket so the client has data before the next poll tick.
 */
@Injectable()
export class WgSocketHandler implements ISocketHandler {
  constructor(
    @inject(WgStatisticsService)
    private readonly statsService: WgStatisticsService,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("wg:subscribe:overview", () => {
      socket.join("wg:overview");

      const snapshot = this.statsService.getCurrentOverview();

      if (snapshot) socket.emit("wg:stats:overview", snapshot);
    });

    socket.on("wg:unsubscribe:overview", () => {
      socket.leave("wg:overview");
    });

    socket.on("wg:subscribe:server", (serverId: string) => {
      if (!serverId) return;
      socket.join(`wg:server:${serverId}`);

      const snapshot = this.statsService.getCurrentServer(serverId);

      if (snapshot) socket.emit("wg:server:stats", snapshot);
    });

    socket.on("wg:unsubscribe:server", (serverId: string) => {
      if (serverId) socket.leave(`wg:server:${serverId}`);
    });

    socket.on("wg:subscribe:peer", (peerId: string) => {
      if (!peerId) return;
      socket.join(`wg:peer:${peerId}`);

      const snapshot = this.statsService.getCurrentPeer(peerId);

      if (snapshot) socket.emit("wg:peer:stats", snapshot);
    });

    socket.on("wg:unsubscribe:peer", (peerId: string) => {
      if (peerId) socket.leave(`wg:peer:${peerId}`);
    });
  }
}
