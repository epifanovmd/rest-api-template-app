import { asJobHandler, Module } from "../../core";
import { asSocketListener } from "../socket";
import { SyncController } from "./sync.controller";
import { SyncListener } from "./sync.listener";
import { SyncService } from "./sync.service";
import { SyncCleanupJob } from "./sync-cleanup.job";
import { SyncCompactionJob } from "./sync-compaction.job";
import { SyncLog } from "./sync-log.entity";
import { SyncLogRepository } from "./sync-log.repository";
import { SyncState } from "./sync-state.entity";

@Module({
  entities: [SyncLog, SyncState],
  providers: [
    SyncLogRepository,
    SyncService,
    SyncController,
    asSocketListener(SyncListener),
    asJobHandler(SyncCleanupJob),
    asJobHandler(SyncCompactionJob),
  ],
})
export class SyncModule {}
