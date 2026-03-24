import { inject } from "inversify";
import * as cron from "node-cron";

import { config } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
import { WgPeerService } from "../wg-peer";
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
    await this.statsService.loadLastKnownFromDb();

    const { dbWriteIntervalSec, socketPollIntervalSec } = config.wireguard;

    // Опрос каждые socketPollIntervalSec — всегда отправляет в сокет,
    // пишет в БД каждые (dbWriteIntervalSec / socketPollIntervalSec) тиков
    const dbWriteEvery = Math.max(
      1,
      Math.round(dbWriteIntervalSec / socketPollIntervalSec),
    );
    let tick = 0;

    const pollCron = `*/${socketPollIntervalSec} * * * * *`;

    this.statsTasks.push(
      cron.schedule(pollCron, () => {
        tick += 1;
        const persistToDb = tick % dbWriteEvery === 0;

        this.statsService
          .poll(persistToDb)
          .catch(err => logger.error({ err }, "[WgStats] Poll failed"));
      }),
    );

    // Очистка просроченных пиров — каждую минуту
    this.statsTasks.push(
      cron.schedule("* * * * *", () => {
        this.peerService
          .disableExpiredPeers()
          .catch(err => logger.error({ err }, "[WgStats] Expire check failed"));
      }),
    );

    // Очистка устаревшей статистики — ежедневно в 03:00
    this.statsTasks.push(
      cron.schedule("0 3 * * *", () => {
        this.statsService
          .purgeOldStats()
          .catch(err => logger.error({ err }, "[WgStats] Purge failed"));
      }),
    );

    logger.info({ pollCron }, "[WgStats] Statistics polling started");
  }

  async destroy(): Promise<void> {
    this.statsTasks.forEach(t => t.stop());
    this.statsTasks = [];
  }
}
