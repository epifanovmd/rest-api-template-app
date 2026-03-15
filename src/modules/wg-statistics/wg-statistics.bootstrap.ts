import { inject } from "inversify";
import * as cron from "node-cron";

import { config } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
import { WgPeerService } from "../wg-peer/wg-peer.service";
import { WgStatisticsService } from "./wg-statistics.service";

@Injectable()
export class WgStatisticsBootstrap implements IBootstrap {
  private statsTasks: cron.ScheduledTask[] = [];

  constructor(
    @inject(WgStatisticsService)
    private readonly statsService: WgStatisticsService,
    @inject(WgPeerService)
    private readonly peerService: WgPeerService,
  ) {}

  async initialize(): Promise<void> {
    const { statsIntervalSec, speedSampleIntervalSec } = config.wireguard;

    // Traffic + speed polling
    const pollCron = `*/${statsIntervalSec} * * * * *`;

    this.statsTasks.push(
      cron.schedule(pollCron, () => {
        this.statsService.poll().catch(err =>
          logger.error({ err }, "[WgStats] Poll failed"),
        );
      }),
    );

    // Expired peer cleanup — every minute
    this.statsTasks.push(
      cron.schedule("* * * * *", () => {
        this.peerService.disableExpiredPeers().catch(err =>
          logger.error({ err }, "[WgStats] Expire check failed"),
        );
      }),
    );

    // Stats retention cleanup — daily at 03:00
    this.statsTasks.push(
      cron.schedule("0 3 * * *", () => {
        this.statsService.purgeOldStats().catch(err =>
          logger.error({ err }, "[WgStats] Purge failed"),
        );
      }),
    );

    logger.info(
      { pollCron },
      "[WgStats] Statistics polling started",
    );
  }

  async destroy(): Promise<void> {
    this.statsTasks.forEach(t => t.stop());
    this.statsTasks = [];
  }
}
