import { Injectable } from "../../core";
import { TSocket } from "../socket/socket.types";
import {
  ISocketHandler,
  SOCKET_HANDLER,
} from "../socket/socket-handler.interface";

/**
 * Handles Socket.IO subscription events for WireGuard stats.
 *
 * Clients join named rooms to receive targeted updates:
 *   wg:overview         — overall VPN stats
 *   wg:server:{id}      — specific server stats + status
 *   wg:peer:{id}        — specific peer stats + status
 */
@Injectable()
export class WgSocketHandler implements ISocketHandler {
  onConnection(socket: TSocket): void {
    socket.on("wg:subscribe:overview", () => {
      socket.join("wg:overview");
    });

    socket.on("wg:unsubscribe:overview", () => {
      socket.leave("wg:overview");
    });

    socket.on("wg:subscribe:server", (serverId: string) => {
      if (serverId) socket.join(`wg:server:${serverId}`);
    });

    socket.on("wg:unsubscribe:server", (serverId: string) => {
      if (serverId) socket.leave(`wg:server:${serverId}`);
    });

    socket.on("wg:subscribe:peer", (peerId: string) => {
      if (peerId) socket.join(`wg:peer:${peerId}`);
    });

    socket.on("wg:unsubscribe:peer", (peerId: string) => {
      if (peerId) socket.leave(`wg:peer:${peerId}`);
    });
  }
}
