import { asHealthIndicator, JobQueue, Module } from "../../core";
import { JobRunner } from "./job.runner";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobsBootstrap } from "./jobs.bootstrap";
import { JobsHealthIndicator } from "./jobs.health";
import { PgBossService } from "./pg-boss.service";
import { PgBossJobQueue } from "./pg-boss-job.queue";

/** Очередь задач (pg-boss): обработчики, повторы, cron. */
@Module({
  providers: [
    asHealthIndicator(JobsHealthIndicator),
    PgBossService,
    JobHandlerRegistry,
    JobRunner,
    { provide: JobQueue, useClass: PgBossJobQueue },
  ],
  bootstrappers: [JobsBootstrap],
})
export class JobsModule {}
