import "./jobs.permissions";

import {
  asExternalJobHandler,
  asHealthIndicator,
  asJobHandler,
  asWorkerRequestHandler,
  JobQueue,
  Module,
} from "../../core";
import { asSocketListener, asSocketRoomPolicy } from "../socket";
import { DemoEchoJobHandler } from "./demo-echo.handler";
import { DemoEchoLookupHandler } from "./demo-echo-lookup.handler";
import { ExternalJobService } from "./external-job.service";
import { ExternalSyncJobHandler } from "./external-sync.handler";
import { JobRunner } from "./job.runner";
import { JobCancelWatcher } from "./job-cancel.watcher";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobLeaseReaper } from "./job-lease.reaper";
import { JobResultWaiter } from "./job-result.waiter";
import { JobRetentionJobHandler } from "./job-retention.handler";
import { JobRoomPolicy } from "./job-room.policy";
import { JobRun } from "./job-run.entity";
import { JobRunRepository } from "./job-run.repository";
import { JobRunTracker } from "./job-run.tracker";
import { JobRunViews } from "./job-run.views";
import { JobSignals } from "./job-signals";
import { JobsBootstrap } from "./jobs.bootstrap";
import { JobsController } from "./jobs.controller";
import { JobsHealthIndicator } from "./jobs.health";
import { JobsSocketListener } from "./jobs.listener";
import { JobsService } from "./jobs.service";
import { LeaseReaperJobHandler } from "./lease-reaper.handler";
import { PgBossService } from "./pg-boss.service";
import { PgBossJobQueue } from "./pg-boss-job.queue";

/**
 * Очередь задач (pg-boss): обработчики, cron, видимые задачи; внешние
 * очереди выполняет исполнитель `EXTERNAL_JOB_EXECUTOR` (агенты).
 */
@Module({
  entities: [JobRun],
  providers: [
    asHealthIndicator(JobsHealthIndicator),
    PgBossService,
    JobRunRepository,
    JobRunTracker,
    JobRunViews,
    JobHandlerRegistry,
    JobSignals,
    JobCancelWatcher,
    JobResultWaiter,
    JobRunner,
    JobLeaseReaper,
    { provide: JobQueue, useClass: PgBossJobQueue },
    JobsService,
    ExternalJobService,
    JobsController,
    asSocketListener(JobsSocketListener),
    asSocketRoomPolicy(JobRoomPolicy),
    asJobHandler(LeaseReaperJobHandler),
    asJobHandler(JobRetentionJobHandler),
    asJobHandler(ExternalSyncJobHandler),
    asExternalJobHandler(DemoEchoJobHandler),
    asWorkerRequestHandler(DemoEchoLookupHandler),
  ],
  bootstrappers: [JobsBootstrap],
})
export class JobsModule {}
