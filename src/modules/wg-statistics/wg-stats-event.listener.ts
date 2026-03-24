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
 * Слушает события статистики из EventBus и рассылает
 * данные в реальном времени в подписанные Socket.IO комнаты.
 *
 * Комнаты:
 *   wg:overview         — общая статистика (для всех администраторов)
 *   wg:server:{id}      — статистика по серверу
 *   wg:peer:{id}        — статистика по пиру
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
