import { Module } from "../../core";
import { SOCKET_EVENT_LISTENER } from "../socket/socket-event-listener.interface";
import { WgServerBootstrap } from "./wg-server.bootstrap";
import { WgServerController } from "./wg-server.controller";
import { WgServerRepository } from "./wg-server.repository";
import { WgServerService } from "./wg-server.service";
import { WgServerStatusListener } from "./wg-server-status.listener";

@Module({
  providers: [
    WgServerRepository,
    WgServerService,
    WgServerController,
    { provide: SOCKET_EVENT_LISTENER, useClass: WgServerStatusListener },
  ],
  bootstrappers: [WgServerBootstrap],
})
export class WgServerModule {}
