import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { SyncCleanupBootstrap } from "./sync.bootstrap";
import { SyncController } from "./sync.controller";
import { SyncListener } from "./sync.listener";
import { SyncService } from "./sync.service";
import { SyncLogRepository } from "./sync-log.repository";

@Module({
  providers: [
    SyncLogRepository,
    SyncService,
    SyncController,
    asSocketListener(SyncListener),
  ],
  bootstrappers: [SyncCleanupBootstrap],
})
export class SyncModule {}
