import { inject } from "inversify";

import { Injectable } from "../../core";
import { TSocket } from "../socket/socket.types";
import {
  ISocketHandler,
  SOCKET_HANDLER,
} from "../socket/socket-handler.interface";
import { WgStatisticsService } from "./wg-statistics.service";

/**
 * Обрабатывает Socket.IO события подписки на статистику WireGuard.
 *
 * Клиенты вступают в именованные комнаты для получения целевых обновлений:
 *   wg:overview         — общая статистика VPN
 *   wg:server:{id}      — статистика + статус конкретного сервера
 *   wg:peer:{id}        — статистика + статус конкретного пира
 *
 * При подписке текущий закэшированный снимок немедленно отправляется
 * в сокет, чтобы клиент имел данные до следующего тика опроса.
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
