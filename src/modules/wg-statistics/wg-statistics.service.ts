import { inject } from "inversify";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import {
  WgOverviewStatsPayload,
  WgPeerStatsPayload,
  WgServerStatsPayload,
} from "../socket/socket.types";
import { WgCliService } from "../wg-cli/wg-cli.service";
import { WgPeerActiveChangedEvent } from "../wg-peer/events";
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
  /** Cumulative offset accumulated from WireGuard counter resets */
  rxOffset: number;
  txOffset: number;
  timestamp: number;
}

interface DeadbandSnapshot {
  rxSpeedBps: number;
  txSpeedBps: number;
  rxBytes: number;
  txBytes: number;
  timestamp: number;
  activePeers?: number;
}

@Injectable()
export class WgStatisticsService {
  /** In-memory snapshots for speed calculation */
  private prevSnapshots = new Map<string, PeerPrevSnapshot>();

  /**
   * Last adjusted bytes loaded from DB at startup.
   * Used to compute the initial offset when prevSnapshots is empty
   * (covers both app restart + WG restart scenarios).
   */
  private lastKnownDb = new Map<string, { rxBytes: number; txBytes: number }>();

  /**
   * Dead band compression: track last emitted/saved values per peer.
   * Skip emission/write when values haven't changed significantly.
   *
   * Socket: emit if speed changed > 256 bps OR max 30 s silence.
   * DB:     save  if speed changed > 1024 bps OR bytes changed OR max 60 s silence.
   */
  private readonly SOCKET_DEADBAND_BPS = 256;
  private readonly SOCKET_MAX_SILENCE_MS = 30_000;
  private readonly DB_DEADBAND_BPS = 1024;
  private readonly DB_MAX_SILENCE_MS = 60_000;

  private lastSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastDbSave = new Map<string, DeadbandSnapshot>();
  private lastServerSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastOverviewSocketEmit: DeadbandSnapshot | undefined;

  private needsUpdate(
    last: DeadbandSnapshot | undefined,
    rxSpeedBps: number,
    txSpeedBps: number,
    rxBytes: number,
    txBytes: number,
    nowMs: number,
    maxSilenceMs: number,
    deadbandBps: number,
    activePeers?: number,
  ): boolean {
    if (!last) return true;
    if (nowMs - last.timestamp >= maxSilenceMs) return true;
    if (rxBytes !== last.rxBytes || txBytes !== last.txBytes) return true;
    if (activePeers !== undefined && activePeers !== last.activePeers)
      return true;

    return (
      Math.abs(rxSpeedBps - last.rxSpeedBps) > deadbandBps ||
      Math.abs(txSpeedBps - last.txSpeedBps) > deadbandBps
    );
  }

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
   * Load last known adjusted bytes from DB for all peers.
   * Called once at bootstrap before polling starts so that after any restart
   * (app or WG) the offsets are correctly restored and adjusted bytes stay monotonic.
   */
  async loadLastKnownFromDb(): Promise<void> {
    const allPeers = await this.peerRepo.find();

    await Promise.all(
      allPeers.map(async peer => {
        const [latest] = await this.trafficRepo.getLatestByPeer(peer.id, 1);

        if (latest) {
          this.lastKnownDb.set(peer.id, {
            rxBytes: latest.rxBytes,
            txBytes: latest.txBytes,
          });
        }
      }),
    );

    logger.info(
      { peers: this.lastKnownDb.size },
      "[WgStats] Loaded last known bytes from DB",
    );
  }

  /**
   * Main polling tick — called by WgStatisticsBootstrap on interval.
   * 1. Query `wg show all dump`
   * 2. Calculate speeds from deltas
   * 3. Persist traffic snapshots and speed samples (only if persistToDb=true)
   * 4. Emit WgStatsUpdatedEvent for socket broadcast
   */
  async poll(persistToDb = true): Promise<void> {
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


          // Speed calculation with counter-reset detection (WG restart resets counters to 0)
          const snapshotKey = dbPeer.id;
          const prev = this.prevSnapshots.get(snapshotKey);
          let rxSpeed = 0;
          let txSpeed = 0;

          // Compute offset to keep adjusted bytes monotonically increasing:
          // - prev exists: detect WG restart by raw drop
          // - prev absent (first tick after app start): restore offset from last DB value
          const lastKnown = this.lastKnownDb.get(snapshotKey);
          const rxOffset = prev
            ? wgPeer.rxBytes < prev.rxBytes
              ? prev.rxOffset + prev.rxBytes
              : prev.rxOffset
            : Math.max(0, (lastKnown?.rxBytes ?? 0) - wgPeer.rxBytes);
          const txOffset = prev
            ? wgPeer.txBytes < prev.txBytes
              ? prev.txOffset + prev.txBytes
              : prev.txOffset
            : Math.max(0, (lastKnown?.txBytes ?? 0) - wgPeer.txBytes);

          const adjustedRx = wgPeer.rxBytes + rxOffset;
          const adjustedTx = wgPeer.txBytes + txOffset;

          if (prev) {
            const dtSec = (nowMs - prev.timestamp) / 1000;

            if (dtSec > 0) {
              const prevAdjustedRx = prev.rxBytes + prev.rxOffset;
              const prevAdjustedTx = prev.txBytes + prev.txOffset;

              rxSpeed = Math.max(0, (adjustedRx - prevAdjustedRx) / dtSec);
              txSpeed = Math.max(0, (adjustedTx - prevAdjustedTx) / dtSec);
            }
          }

          this.prevSnapshots.set(snapshotKey, {
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            rxOffset,
            txOffset,
            timestamp: nowMs,
          });

          // Accumulate adjusted (reset-safe) values
          srvRx += adjustedRx;
          srvTx += adjustedTx;
          srvRxSpeed += rxSpeed;
          srvTxSpeed += txSpeed;
          if (isActive) srvActivePeers += 1;

          // Dead band: only emit/save when value changed significantly or silence expired
          const emitToSocket = this.needsUpdate(
            this.lastSocketEmit.get(snapshotKey),
            rxSpeed,
            txSpeed,
            adjustedRx,
            adjustedTx,
            nowMs,
            this.SOCKET_MAX_SILENCE_MS,
            this.SOCKET_DEADBAND_BPS,
          );

          const saveToDb =
            persistToDb &&
            this.needsUpdate(
              this.lastDbSave.get(snapshotKey),
              rxSpeed,
              txSpeed,
              adjustedRx,
              adjustedTx,
              nowMs,
              this.DB_MAX_SILENCE_MS,
              this.DB_DEADBAND_BPS,
            );

          if (emitToSocket) {
            this.lastSocketEmit.set(snapshotKey, {
              rxSpeedBps: rxSpeed,
              txSpeedBps: txSpeed,
              rxBytes: adjustedRx,
              txBytes: adjustedTx,
              timestamp: nowMs,
            });

            peerStats.push({
              peerId: dbPeer.id,
              serverId: server.id,
              rxBytes: adjustedRx,
              txBytes: adjustedTx,
              rxSpeedBps: rxSpeed,
              txSpeedBps: txSpeed,
              lastHandshake: wgPeer.lastHandshake,
              isActive,
              timestamp: now,
            });

            this.eventBus.emit(
              new WgPeerActiveChangedEvent(
                dbPeer.id,
                server.id,
                wgPeer.lastHandshake,
              ),
            );
          }

          if (saveToDb) {
            this.lastDbSave.set(snapshotKey, {
              rxSpeedBps: rxSpeed,
              txSpeedBps: txSpeed,
              rxBytes: adjustedRx,
              txBytes: adjustedTx,
              timestamp: nowMs,
            });

            await this.peerRepo.update(
              { id: dbPeer.id },
              { lastHandshake: wgPeer.lastHandshake },
            );

            // Persist traffic snapshot (adjusted bytes survive WG restarts)
            trafficInserts.push({
              peerId: dbPeer.id,
              serverId: server.id,
              rxBytes: adjustedRx,
              txBytes: adjustedTx,
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
          }
        }

        globalRx += srvRx;
        globalTx += srvTx;
        globalRxSpeed += srvRxSpeed;
        globalTxSpeed += srvTxSpeed;
        totalPeers += showData.peers.length;
        activePeers += srvActivePeers;

        if (
          this.needsUpdate(
            this.lastServerSocketEmit.get(server.id),
            srvRxSpeed,
            srvTxSpeed,
            srvRx,
            srvTx,
            nowMs,
            this.SOCKET_MAX_SILENCE_MS,
            this.SOCKET_DEADBAND_BPS,
          )
        ) {
          this.lastServerSocketEmit.set(server.id, {
            rxSpeedBps: srvRxSpeed,
            txSpeedBps: srvTxSpeed,
            rxBytes: srvRx,
            txBytes: srvTx,
            timestamp: nowMs,
          });

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
      }

      // Batch persist — inserts are already filtered by dead band + DB tick guard
      if (trafficInserts.length > 0) {
        await this.trafficRepo.save(trafficInserts as WgTrafficStat[]);
      }
      if (speedInserts.length > 0) {
        await this.speedRepo.save(speedInserts as WgSpeedSample[]);
      }

      const overviewChanged = this.needsUpdate(
        this.lastOverviewSocketEmit,
        globalRxSpeed,
        globalTxSpeed,
        globalRx,
        globalTx,
        nowMs,
        this.SOCKET_MAX_SILENCE_MS,
        this.SOCKET_DEADBAND_BPS,
        activePeers,
      );

      if (
        !overviewChanged &&
        serverStats.length === 0 &&
        peerStats.length === 0
      ) {
        return;
      }

      if (overviewChanged) {
        this.lastOverviewSocketEmit = {
          rxSpeedBps: globalRxSpeed,
          txSpeedBps: globalTxSpeed,
          rxBytes: globalRx,
          txBytes: globalTx,
          timestamp: nowMs,
          activePeers,
        };
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

      this.eventBus.emit(
        new WgStatsUpdatedEvent(overview, serverStats, peerStats),
      );
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
