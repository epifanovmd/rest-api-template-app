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
   * Агрегированный трафик + скорость по всем серверам и всем пирам.
   * wg:stats:view — полная сводка; wg:server:own — только свои серверы;
   * wg:peer:own — только свои пиры.
   * @summary Сводная статистика
   * @param from Строка ISO даты (по умолчанию: 24ч назад)
   * @param to Строка ISO даты (по умолчанию: сейчас)
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
   * Агрегированный трафик + скорость для конкретного сервера (все его пиры).
   * Опционально фильтровать по одному пиру через параметр peerId.
   * @summary Статистика сервера
   * @param serverId ID сервера
   * @param peerId Опциональный ID пира для фильтрации
   * @param from Строка ISO даты (по умолчанию: 24ч назад)
   * @param to Строка ISO даты (по умолчанию: сейчас)
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
   * Агрегированный трафик + скорость для конкретного пира.
   * wg:stats:view может просматривать любой пир; wg:peer:own только свои.
   * @summary Статистика пира
   * @param peerId ID пира
   * @param from Строка ISO даты (по умолчанию: 24ч назад)
   * @param to Строка ISO даты (по умолчанию: сейчас)
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
   * Текущая статистика в реальном времени по всем серверам — используется при начальной загрузке страницы
   * до получения первого события wg:stats:overview через WebSocket.
   * @summary Текущая сводная статистика
   */
  @Security("jwt", ["permission:wg:stats:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/overview/current")
  async getOverviewCurrent(): Promise<WgOverviewStatsPayload | null> {
    return this.statsService.getCurrentOverview();
  }

  /**
   * Текущая статистика в реальном времени для конкретного сервера — используется при начальной загрузке страницы
   * до получения первого события wg:server:stats через WebSocket.
   * @summary Текущая статистика сервера
   * @param serverId ID сервера
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
   * Текущая статистика в реальном времени для конкретного пира — используется при начальной загрузке страницы
   * до получения первого события wg:peer:stats через WebSocket.
   * @summary Текущая статистика пира
   * @param peerId ID пира
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
