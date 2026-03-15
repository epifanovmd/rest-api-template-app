import { inject } from "inversify";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import {
  WgOverviewStatsPayload,
  WgPeerStatsPayload,
  WgServerStatsPayload,
} from "../socket/socket.types";
import { WgCliService, WgPeerStats } from "../wg-cli/wg-cli.service";
import { WgPeerRepository } from "../wg-peer/wg-peer.repository";
import { WgServerRepository } from "../wg-server/wg-server.repository";
import { EWgServerStatus } from "../wg-server/wg-server.types";
import { WgStatsUpdatedEvent } from "./events";
import { WgSpeedSample } from "./wg-speed-sample.entity";
import {
  WgSpeedSampleRepository,
  WgTrafficStatRepository,
} from "./wg-statistics.repository";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

interface PeerPrevSnapshot {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
}

@Injectable()
export class WgStatisticsService {
  /** In-memory snapshots for speed calculation */
  private prevSnapshots = new Map<string, PeerPrevSnapshot>();

  /** ACTIVE_THRESHOLD: peer is active if last handshake < 3 min ago */
  private readonly ACTIVE_THRESHOLD_MS = 3 * 60 * 1000;

  constructor(
    @inject(WgTrafficStatRepository)
    private readonly trafficRepo: WgTrafficStatRepository,
    @inject(WgSpeedSampleRepository)
    private readonly speedRepo: WgSpeedSampleRepository,
    @inject(WgServerRepository)
    private readonly serverRepo: WgServerRepository,
    @inject(WgPeerRepository)
    private readonly peerRepo: WgPeerRepository,
    @inject(WgCliService)
    private readonly cli: WgCliService,
    @inject(EventBus)
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Main polling tick — called by WgStatisticsBootstrap on interval.
   * 1. Query `wg show all dump`
   * 2. Calculate speeds from deltas
   * 3. Persist traffic snapshots and speed samples
   * 4. Emit WgStatsUpdatedEvent for socket broadcast
   */
  async poll(): Promise<void> {
    try {
      const servers = await this.serverRepo.findAllEnabled();
      const upServers = servers.filter(s => s.status === EWgServerStatus.UP);

      if (upServers.length === 0) return;

      const now = new Date();
      const nowMs = now.getTime();

      let globalRx = 0;
      let globalTx = 0;
      let globalRxSpeed = 0;
      let globalTxSpeed = 0;
      let totalPeers = 0;
      let activePeers = 0;

      const serverStats: WgServerStatsPayload[] = [];
      const peerStats: WgPeerStatsPayload[] = [];

      // Build public_key → peer DB record map
      const allPeers = await this.peerRepo.find();
      const peerByPublicKey = new Map(allPeers.map(p => [p.publicKey, p]));

      const trafficInserts: Partial<WgTrafficStat>[] = [];
      const speedInserts: Partial<WgSpeedSample>[] = [];

      for (const server of upServers) {
        let showData;

        try {
          [showData] = await this.cli.show(server.interface);
        } catch {
          continue;
        }

        if (!showData) continue;

        let srvRx = 0;
        let srvTx = 0;
        let srvRxSpeed = 0;
        let srvTxSpeed = 0;
        let srvActivePeers = 0;

        for (const wgPeer of showData.peers) {
          const dbPeer = peerByPublicKey.get(wgPeer.publicKey);

          if (!dbPeer) continue;

          const isActive =
            wgPeer.lastHandshake !== null &&
            nowMs - wgPeer.lastHandshake.getTime() < this.ACTIVE_THRESHOLD_MS;

          // Speed calculation
          const snapshotKey = dbPeer.id;
          const prev = this.prevSnapshots.get(snapshotKey);
          let rxSpeed = 0;
          let txSpeed = 0;

          if (prev) {
            const dtSec = (nowMs - prev.timestamp) / 1000;

            if (dtSec > 0) {
              rxSpeed = Math.max(0, (wgPeer.rxBytes - prev.rxBytes) / dtSec);
              txSpeed = Math.max(0, (wgPeer.txBytes - prev.txBytes) / dtSec);
            }
          }

          this.prevSnapshots.set(snapshotKey, {
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            timestamp: nowMs,
          });

          // Accumulate
          srvRx += wgPeer.rxBytes;
          srvTx += wgPeer.txBytes;
          srvRxSpeed += rxSpeed;
          srvTxSpeed += txSpeed;
          if (isActive) srvActivePeers++;

          // Persist traffic snapshot
          trafficInserts.push({
            peerId: dbPeer.id,
            serverId: server.id,
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            lastHandshake: wgPeer.lastHandshake,
            endpoint: wgPeer.endpoint,
            timestamp: now,
          });

          // Persist speed sample
          speedInserts.push({
            peerId: dbPeer.id,
            serverId: server.id,
            rxSpeedBps: rxSpeed,
            txSpeedBps: txSpeed,
            isActive,
            timestamp: now,
          });

          peerStats.push({
            peerId: dbPeer.id,
            serverId: server.id,
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            rxSpeedBps: rxSpeed,
            txSpeedBps: txSpeed,
            lastHandshake: wgPeer.lastHandshake,
            isActive,
            timestamp: now,
          });
        }

        globalRx += srvRx;
        globalTx += srvTx;
        globalRxSpeed += srvRxSpeed;
        globalTxSpeed += srvTxSpeed;
        totalPeers += showData.peers.length;
        activePeers += srvActivePeers;

        serverStats.push({
          serverId: server.id,
          interface: server.interface,
          totalRxBytes: srvRx,
          totalTxBytes: srvTx,
          rxSpeedBps: srvRxSpeed,
          txSpeedBps: srvTxSpeed,
          peerCount: showData.peers.length,
          activePeerCount: srvActivePeers,
          timestamp: now,
        });
      }

      // Batch persist
      if (trafficInserts.length > 0) {
        await this.trafficRepo.save(trafficInserts as WgTrafficStat[]);
      }
      if (speedInserts.length > 0) {
        await this.speedRepo.save(speedInserts as WgSpeedSample[]);
      }

      const overview: WgOverviewStatsPayload = {
        totalServers: upServers.length,
        activeServers: upServers.length,
        totalPeers,
        activePeers,
        totalRxBytes: globalRx,
        totalTxBytes: globalTx,
        rxSpeedBps: globalRxSpeed,
        txSpeedBps: globalTxSpeed,
        timestamp: now,
      };

      this.eventBus.emit(new WgStatsUpdatedEvent(overview, serverStats, peerStats));
    } catch (err) {
      logger.error({ err }, "[WgStats] Poll error");
    }
  }

  /**
   * Purge stats older than retentionDays
   */
  async purgeOldStats(): Promise<void> {
    const cutoff = new Date(
      Date.now() - config.wireguard.statsRetentionDays * 24 * 60 * 60 * 1000,
    );

    const [deletedTraffic, deletedSpeed] = await Promise.all([
      this.trafficRepo.deleteOlderThan(cutoff),
      this.speedRepo.deleteOlderThan(cutoff),
    ]);

    logger.info(
      { deletedTraffic, deletedSpeed },
      "[WgStats] Purged old statistics",
    );
  }

  // ─── Query methods for HTTP endpoints ────────────────────────────────────────

  async getPeerTrafficHistory(
    peerId: string,
    from: Date,
    to: Date,
  ): Promise<WgTrafficStat[]> {
    return this.trafficRepo.getByPeerInRange(peerId, from, to);
  }

  async getPeerSpeedHistory(
    peerId: string,
    from: Date,
    to: Date,
  ): Promise<WgSpeedSample[]> {
    return this.speedRepo.getByPeerInRange(peerId, from, to);
  }

  async getServerTrafficHistory(
    serverId: string,
    from: Date,
    to: Date,
  ): Promise<WgTrafficStat[]> {
    return this.trafficRepo.getByServerInRange(serverId, from, to);
  }

  async getServerSpeedHistory(
    serverId: string,
    from: Date,
    to: Date,
  ): Promise<WgSpeedSample[]> {
    return this.speedRepo.getByServerInRange(serverId, from, to);
  }

  async getLatestPeerStats(peerId: string): Promise<WgTrafficStat[]> {
    return this.trafficRepo.getLatestByPeer(peerId, 1);
  }

  async getLatestPeerSpeed(peerId: string): Promise<WgSpeedSample[]> {
    return this.speedRepo.getLatestByPeer(peerId, 1);
  }
}
