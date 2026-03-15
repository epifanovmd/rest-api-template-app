import { inject } from "inversify";
import { Controller, Get, Query, Route, Security, Tags } from "tsoa";

import { Injectable } from "../../core";
import {
  IWgPeerStatsResponse,
  IWgServerStatsResponse,
  WgSpeedSampleDto,
  WgTrafficStatDto,
} from "./dto";
import { WgStatisticsService } from "./wg-statistics.service";

const DEFAULT_RANGE_HOURS = 24;

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_RANGE_HOURS * 60 * 60 * 1000);

  return { from: fromDate, to: toDate };
}

@Injectable()
@Tags("WireGuard Statistics")
@Route("api/wg/statistics")
export class WgStatisticsController extends Controller {
  constructor(
    @inject(WgStatisticsService)
    private readonly statsService: WgStatisticsService,
  ) {
    super();
  }

  /**
   * Get traffic history for a specific peer.
   * @summary Peer traffic history
   * @param peerId Peer ID
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["role:admin"])
  @Get("/peers/{peerId}/traffic")
  async getPeerTraffic(
    peerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<WgTrafficStatDto[]> {
    const range = parseRange(from, to);
    const records = await this.statsService.getPeerTrafficHistory(
      peerId,
      range.from,
      range.to,
    );

    return records.map(WgTrafficStatDto.fromEntity);
  }

  /**
   * Get speed samples for a specific peer.
   * @summary Peer speed history
   * @param peerId Peer ID
   * @param from ISO date string (default: 1h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["role:admin"])
  @Get("/peers/{peerId}/speed")
  async getPeerSpeed(
    peerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<WgSpeedSampleDto[]> {
    const range = parseRange(from, to);
    const records = await this.statsService.getPeerSpeedHistory(
      peerId,
      range.from,
      range.to,
    );

    return records.map(WgSpeedSampleDto.fromEntity);
  }

  /**
   * Get combined latest stats + history for a peer.
   * @summary Peer full stats
   * @param peerId Peer ID
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["role:admin"])
  @Get("/peers/{peerId}")
  async getPeerStats(
    peerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgPeerStatsResponse> {
    const range = parseRange(from, to);
    const [traffic, speed, latestTraffic, latestSpeed] = await Promise.all([
      this.statsService.getPeerTrafficHistory(peerId, range.from, range.to),
      this.statsService.getPeerSpeedHistory(peerId, range.from, range.to),
      this.statsService.getLatestPeerStats(peerId),
      this.statsService.getLatestPeerSpeed(peerId),
    ]);

    const lt = latestTraffic[0];
    const ls = latestSpeed[0];

    return {
      peerId,
      traffic: traffic.map(WgTrafficStatDto.fromEntity),
      speed: speed.map(WgSpeedSampleDto.fromEntity),
      latest:
        lt && ls
          ? {
              rxBytes: lt.rxBytes,
              txBytes: lt.txBytes,
              rxSpeedBps: ls.rxSpeedBps,
              txSpeedBps: ls.txSpeedBps,
              isActive: ls.isActive,
              lastHandshake: lt.lastHandshake,
            }
          : null,
    };
  }

  /**
   * Get traffic history for a server (all peers aggregated).
   * @summary Server traffic history
   * @param serverId Server ID
   * @param from ISO date string
   * @param to ISO date string
   */
  @Security("jwt", ["role:admin"])
  @Get("/servers/{serverId}/traffic")
  async getServerTraffic(
    serverId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<WgTrafficStatDto[]> {
    const range = parseRange(from, to);
    const records = await this.statsService.getServerTrafficHistory(
      serverId,
      range.from,
      range.to,
    );

    return records.map(WgTrafficStatDto.fromEntity);
  }

  /**
   * Get speed history for a server.
   * @summary Server speed history
   * @param serverId Server ID
   * @param from ISO date string
   * @param to ISO date string
   */
  @Security("jwt", ["role:admin"])
  @Get("/servers/{serverId}/speed")
  async getServerSpeed(
    serverId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<WgSpeedSampleDto[]> {
    const range = parseRange(from, to);
    const records = await this.statsService.getServerSpeedHistory(
      serverId,
      range.from,
      range.to,
    );

    return records.map(WgSpeedSampleDto.fromEntity);
  }

  /**
   * Get combined stats for a server.
   * @summary Server full stats
   * @param serverId Server ID
   * @param from ISO date string
   * @param to ISO date string
   */
  @Security("jwt", ["role:admin"])
  @Get("/servers/{serverId}")
  async getServerStats(
    serverId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgServerStatsResponse> {
    const range = parseRange(from, to);
    const [traffic, speed] = await Promise.all([
      this.statsService.getServerTrafficHistory(serverId, range.from, range.to),
      this.statsService.getServerSpeedHistory(serverId, range.from, range.to),
    ]);

    return {
      serverId,
      traffic: traffic.map(WgTrafficStatDto.fromEntity),
      speed: speed.map(WgSpeedSampleDto.fromEntity),
    };
  }
}
