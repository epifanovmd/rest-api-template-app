import "./jobs.permissions";

import {
  asExternalJobHandler,
  asHealthIndicator,
  asJobHandler,
  JobQueue,
  Module,
} from "../../core";
import { asSocketListener, asSocketRoomPolicy } from "../socket";
import { DemoEchoJobHandler } from "./demo-echo.handler";
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
import { JobSignals } from "./job-signals";
import { JobWorker } from "./job-worker.entity";
import { JobWorkerTracker } from "./job-worker.tracker";
import { JobsBootstrap } from "./jobs.bootstrap";
import { JobsController } from "./jobs.controller";
import { JobsHealthIndicator } from "./jobs.health";
import { JobsSocketListener } from "./jobs.listener";
import { JobsService } from "./jobs.service";
import { JobsWorkerController } from "./jobs-worker.controller";
import { JobsWorkerService } from "./jobs-worker.service";
import { LeaseReaperJobHandler } from "./lease-reaper.handler";
import { PgBossService } from "./pg-boss.service";
import { PgBossJobQueue } from "./pg-boss-job.queue";

/** Очередь задач (pg-boss): обработчики, cron, видимые задачи, внешние воркеры. */
@Module({
  entities: [JobRun, JobWorker],
  providers: [
    asHealthIndicator(JobsHealthIndicator),
    PgBossService,
    JobRunRepository,
    JobRunTracker,
    JobHandlerRegistry,
    JobSignals,
    JobCancelWatcher,
    JobResultWaiter,
    JobWorkerTracker,
    JobRunner,
    JobLeaseReaper,
    { provide: JobQueue, useClass: PgBossJobQueue },
    JobsService,
    JobsWorkerService,
    JobsController,
    JobsWorkerController,
    asSocketListener(JobsSocketListener),
    asSocketRoomPolicy(JobRoomPolicy),
    asJobHandler(LeaseReaperJobHandler),
    asJobHandler(JobRetentionJobHandler),
    asExternalJobHandler(DemoEchoJobHandler),
  ],
  bootstrappers: [JobsBootstrap],
})
export class JobsModule {}
