import { Module } from "../../core";
import { SOCKET_EVENT_LISTENER } from "../socket/socket-event-listener.interface";
import { SOCKET_HANDLER } from "../socket/socket-handler.interface";
import { WgPeerActiveListener } from "./wg-peer-active.listener";
import { WgSocketHandler } from "./wg-socket.handler";
import { WgSpeedSampleRepository } from "./wg-speed-sample.repository";
import { WgStatisticsBootstrap } from "./wg-statistics.bootstrap";
import { WgStatisticsController } from "./wg-statistics.controller";
import { WgStatisticsService } from "./wg-statistics.service";
import { WgStatsEventListener } from "./wg-stats-event.listener";
import { WgTrafficStatRepository } from "./wg-traffic-stat.repository";

@Module({
  providers: [
    WgTrafficStatRepository,
    WgSpeedSampleRepository,
    WgStatisticsService,
    WgStatisticsController,

    // Socket event listeners
    { provide: SOCKET_EVENT_LISTENER, useClass: WgStatsEventListener },
    { provide: SOCKET_EVENT_LISTENER, useClass: WgPeerActiveListener },

    // Socket handlers (client subscriptions)
    { provide: SOCKET_HANDLER, useClass: WgSocketHandler },
  ],
  bootstrappers: [WgStatisticsBootstrap],
})
export class WgStatisticsModule {}
