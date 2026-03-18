import { Module } from "../../core";
import { SOCKET_EVENT_LISTENER } from "../socket/socket-event-listener.interface";
import { WgServerRepository } from "../wg-server/wg-server.repository";
import { WgIpAllocatorService } from "./wg-ip-allocator.service";
import { WgPeerController } from "./wg-peer.controller";
import { WgPeerRepository } from "./wg-peer.repository";
import { WgPeerService } from "./wg-peer.service";
import { WgPeerStatusListener } from "./wg-peer-status.listener";

@Module({
  providers: [
    WgPeerRepository,
    WgServerRepository,
    WgIpAllocatorService,
    WgPeerService,
    WgPeerController,
    { provide: SOCKET_EVENT_LISTENER, useClass: WgPeerStatusListener },
  ],
})
export class WgPeerModule {}
