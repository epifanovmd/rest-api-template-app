import { Module } from "../../core";
import { WgServerRepository } from "../wg-server/wg-server.repository";
import { WgIpAllocatorService } from "./wg-ip-allocator.service";
import { WgPeerController } from "./wg-peer.controller";
import { WgPeerRepository } from "./wg-peer.repository";
import { WgPeerService } from "./wg-peer.service";

@Module({
  providers: [
    WgPeerRepository,
    WgServerRepository,
    WgIpAllocatorService,
    WgPeerService,
    WgPeerController,
  ],
})
export class WgPeerModule {}
