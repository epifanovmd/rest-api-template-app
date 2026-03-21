import { inject } from "inversify";
import { Controller, Get, Query, Route, Security, Tags } from "tsoa";

import { Injectable } from "../../core";
import { IWgOverviewStatsResponse } from "./dto";
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
   * Aggregated traffic + speed across all servers and all peers.
   * Traffic: cumulative total (monotonically increasing).
   * Speed: sum of peer speeds at each minute bucket.
   * @summary Overview stats
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Get("/overview")
  async getOverviewStats(
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const range = parseRange(from, to);

    return this.statsService.getAggregatedHistory(range.from, range.to);
  }

  /**
   * Aggregated traffic + speed for a specific server (all its peers).
   * Optionally filter by a single peer via peerId query param.
   * @summary Server stats
   * @param serverId Server ID
   * @param peerId Optional peer ID to filter
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Get("/servers/{serverId}")
  async getServerStats(
    serverId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("peerId") peerId?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const range = parseRange(from, to);

    return this.statsService.getAggregatedHistory(range.from, range.to, {
      serverId,
      peerId,
    });
  }

  /**
   * Aggregated traffic + speed for a specific peer.
   * @summary Peer stats
   * @param peerId Peer ID
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Get("/peers/{peerId}")
  async getPeerStats(
    peerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const range = parseRange(from, to);

    return this.statsService.getAggregatedHistory(range.from, range.to, {
      peerId,
    });
  }
}
