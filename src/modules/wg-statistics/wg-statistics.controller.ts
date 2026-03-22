import { ForbiddenException } from "@force-dev/utils";
import { inject } from "inversify";
import { Controller, Get, Query, Request, Route, Security, Tags } from "tsoa";

import { getContextUser, Injectable } from "../../core";
import { hasPermission } from "../../core/auth/has-permission";
import { KoaRequest } from "../../types/koa";
import { EPermissions } from "../permission/permission.types";
import {
  WgOverviewStatsPayload,
  WgPeerStatsPayload,
  WgServerStatsPayload,
} from "../socket/socket.types";
import { WgPeerService } from "../wg-peer/wg-peer.service";
import { WgServerService } from "../wg-server/wg-server.service";
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
    @inject(WgPeerService)
    private readonly peerService: WgPeerService,
    @inject(WgServerService)
    private readonly serverService: WgServerService,
  ) {
    super();
  }

  /**
   * Aggregated traffic + speed across all servers and all peers.
   * wg:stats:view — full overview; wg:server:own — own servers only;
   * wg:peer:own — own peers only.
   * @summary Overview stats
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/overview")
  async getOverviewStats(
    @Request() req: KoaRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const { userId, permissions } = getContextUser(req);
    const range = parseRange(from, to);

    if (hasPermission(permissions, EPermissions.WG_STATS_VIEW)) {
      return this.statsService.getAggregatedHistory(range.from, range.to);
    }

    const [serverIds, peerIds] = await Promise.all([
      hasPermission(permissions, EPermissions.WG_SERVER_OWN)
        ? this.serverService.getOptionsByUser(userId).then(opts => opts.map(s => s.id))
        : Promise.resolve([] as string[]),
      hasPermission(permissions, EPermissions.WG_PEER_OWN)
        ? this.peerService.getByUser(userId).then(([peers]) => peers.map(p => p.id))
        : Promise.resolve([] as string[]),
    ]);

    return this.statsService.getAggregatedHistory(range.from, range.to, {
      serverIds: serverIds.length ? serverIds : undefined,
      peerIds: peerIds.length ? peerIds : undefined,
    });
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
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/servers/{serverId}")
  async getServerStats(
    serverId: string,
    @Request() req: KoaRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("peerId") peerId?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const { userId, permissions } = getContextUser(req);

    if (!hasPermission(permissions, EPermissions.WG_STATS_VIEW)) {
      const server = await this.serverService.getById(serverId);

      if (server.userId !== userId) {
        throw new ForbiddenException("Access denied: not your server.");
      }
    }

    const range = parseRange(from, to);

    return this.statsService.getAggregatedHistory(range.from, range.to, {
      serverId,
      peerId,
    });
  }

  /**
   * Aggregated traffic + speed for a specific peer.
   * wg:stats:view can view any peer; wg:peer:own only their own.
   * @summary Peer stats
   * @param peerId Peer ID
   * @param from ISO date string (default: 24h ago)
   * @param to ISO date string (default: now)
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/{peerId}")
  async getPeerStats(
    peerId: string,
    @Request() req: KoaRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<IWgOverviewStatsResponse> {
    const { userId, permissions } = getContextUser(req);

    if (!hasPermission(permissions, EPermissions.WG_STATS_VIEW)) {
      const peer = await this.peerService.getById(peerId);

      if (peer.userId !== userId) {
        throw new ForbiddenException("Access denied: not your peer.");
      }
    }

    const range = parseRange(from, to);

    return this.statsService.getAggregatedHistory(range.from, range.to, {
      peerId,
    });
  }

  /**
   * Current real-time stats across all servers — use for initial page load
   * before WebSocket delivers the first wg:stats:overview event.
   * @summary Current overview stats
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/overview/current")
  async getOverviewCurrent(): Promise<WgOverviewStatsPayload | null> {
    return this.statsService.getCurrentOverview();
  }

  /**
   * Current real-time stats for a specific server — use for initial page load
   * before WebSocket delivers the first wg:server:stats event.
   * @summary Current server stats
   * @param serverId Server ID
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/servers/{serverId}/current")
  async getServerCurrent(
    serverId: string,
    @Request() req: KoaRequest,
  ): Promise<WgServerStatsPayload | null> {
    const { userId, permissions } = getContextUser(req);

    if (!hasPermission(permissions, EPermissions.WG_STATS_VIEW)) {
      const server = await this.serverService.getById(serverId);

      if (server.userId !== userId) {
        throw new ForbiddenException("Access denied: not your server.");
      }
    }

    return this.statsService.getCurrentServer(serverId);
  }

  /**
   * Current real-time stats for a specific peer — use for initial page load
   * before WebSocket delivers the first wg:peer:stats event.
   * @summary Current peer stats
   * @param peerId Peer ID
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/{peerId}/current")
  async getPeerCurrent(
    peerId: string,
    @Request() req: KoaRequest,
  ): Promise<WgPeerStatsPayload | null> {
    const { userId, permissions } = getContextUser(req);

    if (!hasPermission(permissions, EPermissions.WG_STATS_VIEW)) {
      const peer = await this.peerService.getById(peerId);

      if (peer.userId !== userId) {
        throw new ForbiddenException("Access denied: not your peer.");
      }
    }

    return this.statsService.getCurrentPeer(peerId);
  }
}
