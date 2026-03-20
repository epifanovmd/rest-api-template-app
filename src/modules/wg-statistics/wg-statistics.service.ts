import { inject } from "inversify";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import { WgOverviewStatsPayload } from "../socket/socket.types";
import { WgCliService, WgPeerStats, WgShowOutput } from "../wg-cli/wg-cli.service";
import { WgPeerActiveChangedEvent } from "../wg-peer/events";
import { WG_PEER_ACTIVE_THRESHOLD_MS } from "../wg-peer/wg-peer.constants";
import { WgPeerRepository } from "../wg-peer/wg-peer.repository";
import { WgServerRepository } from "../wg-server/wg-server.repository";
import { EWgServerStatus } from "../wg-server/wg-server.types";
import {
  WgOverviewStatsUpdatedEvent,
  WgPeerStatsUpdatedEvent,
  WgServerStatsUpdatedEvent,
} from "./events";
import { WgSpeedSample } from "./wg-speed-sample.entity";
import {
  WgSpeedSampleRepository,
  WgTrafficStatRepository,
} from "./wg-statistics.repository";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

// ─── Internal state types ─────────────────────────────────────────────────────

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

interface PeerMetrics {
  adjustedRx: number;
  adjustedTx: number;
  rxSpeed: number;
  txSpeed: number;
  rxOffset: number;
  txOffset: number;
  isActive: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WgStatisticsService {
  // ─── In-memory state ────────────────────────────────────────────────────────

  /** Previous WireGuard counters per peer — used for speed calculation */
  private prevSnapshots = new Map<string, PeerPrevSnapshot>();

  /**
   * Last adjusted bytes loaded from DB at startup.
   * Restores monotonic byte counters after app/WG restart.
   */
  private lastKnownDb = new Map<string, { rxBytes: number; txBytes: number }>();

  /** Previous isActive per peer — used to detect activity transitions */
  private prevActiveState = new Map<string, boolean>();

  // ─── Dead-band configuration ─────────────────────────────────────────────────
  //
  // Socket: emit if speed changed > 256 bps  OR max 30 s silence.
  // DB:     save  if speed changed > 1024 bps OR bytes changed OR max 60 s silence.

  private readonly SOCKET_DEADBAND_BPS = 256;
  private readonly SOCKET_MAX_SILENCE_MS = 30_000;
  private readonly DB_DEADBAND_BPS = 1024;
  private readonly DB_MAX_SILENCE_MS = 60_000;

  // ─── Dead-band state ─────────────────────────────────────────────────────────

  private lastSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastDbSave = new Map<string, DeadbandSnapshot>();
  private lastServerSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastOverviewSocketEmit: DeadbandSnapshot | undefined;

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

  // ─── Bootstrap ───────────────────────────────────────────────────────────────

  /**
   * Load last known adjusted bytes from DB for all peers in a single query.
   * Called once at bootstrap so offsets are correctly restored after any restart.
   */
  async loadLastKnownFromDb(): Promise<void> {
    const rows = await this.trafficRepo.getLatestPerPeer();

    for (const row of rows) {
      this.lastKnownDb.set(row.peerId, {
        rxBytes: row.rxBytes,
        txBytes: row.txBytes,
      });
    }

    logger.info(
      { peers: this.lastKnownDb.size },
      "[WgStats] Loaded last known bytes from DB",
    );
  }

  // ─── Main polling tick ───────────────────────────────────────────────────────

  /**
   * Main polling tick — called by WgStatisticsBootstrap on interval.
   *
   * Steps:
   *  1. Fetch live WireGuard data for all UP servers
   *  2. Per-peer: compute speed and adjusted bytes (monotonic, reset-safe)
   *  3. Per-peer: check dead-band → decide what to emit / save
   *  4. Per-peer: detect isActive transition → emit WgPeerActiveChangedEvent
   *  5. Per-server: accumulate totals, check server dead-band
   *  6. Batch persist traffic snapshots, speed samples, lastHandshake to DB
   *  7. Emit WgStatsUpdatedEvent for socket broadcast
   */
  async poll(persistToDb = true): Promise<void> {
    try {
      const servers = await this.serverRepo.findAllEnabled();
      const upServers = servers.filter(s => s.status === EWgServerStatus.UP);

      if (upServers.length === 0) return;

      const now = new Date();
      const nowMs = now.getTime();

      // Build public_key → DB peer map once for the whole tick
      const allPeers = await this.peerRepo.find();
      const peerByPublicKey = new Map(allPeers.map(p => [p.publicKey, p]));

      // Global overview accumulators
      let globalRx = 0;
      let globalTx = 0;
      let globalRxSpeed = 0;
      let globalTxSpeed = 0;
      let totalTrackedPeers = 0;
      let totalActivePeers = 0;

      // Batch write buffers — filled per-peer, flushed after all servers
      const trafficInserts: Partial<WgTrafficStat>[] = [];
      const speedInserts: Partial<WgSpeedSample>[] = [];
      const handshakeUpdates: Array<{ id: string; lastHandshake: Date | null }> = [];

      // ── 1. Iterate UP servers ──────────────────────────────────────────────

      for (const server of upServers) {
        let showData: WgShowOutput;

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
        let srvTrackedPeers = 0;

        for (const wgPeer of showData.peers) {
          const dbPeer = peerByPublicKey.get(wgPeer.publicKey);

          if (!dbPeer) continue;

          srvTrackedPeers += 1;

          // ── 2. Compute speed + adjusted bytes ────────────────────────────

          const metrics = this.computePeerMetrics(wgPeer, dbPeer.id, nowMs);

          this.prevSnapshots.set(dbPeer.id, {
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            rxOffset: metrics.rxOffset,
            txOffset: metrics.txOffset,
            timestamp: nowMs,
          });

          // ── 3. Check dead-band → decide what to update ───────────────────

          const emitToSocket = this.checkSocketDeadband(
            dbPeer.id,
            metrics.rxSpeed,
            metrics.txSpeed,
            metrics.adjustedRx,
            metrics.adjustedTx,
            nowMs,
          );

          const saveToDb =
            persistToDb &&
            this.checkDbDeadband(
              dbPeer.id,
              metrics.rxSpeed,
              metrics.txSpeed,
              metrics.adjustedRx,
              metrics.adjustedTx,
              nowMs,
            );

          // ── 4. Detect isActive transition → emit domain event ────────────

          this.emitActiveChangedIfNeeded(
            dbPeer.id,
            server.id,
            metrics.isActive,
            wgPeer.lastHandshake,
          );

          // ── 5. Emit peer stats event ──────────────────────────────────────

          if (emitToSocket) {
            this.eventBus.emit(
              new WgPeerStatsUpdatedEvent({
                peerId: dbPeer.id,
                serverId: server.id,
                rxBytes: metrics.adjustedRx,
                txBytes: metrics.adjustedTx,
                rxSpeedBps: metrics.rxSpeed,
                txSpeedBps: metrics.txSpeed,
                lastHandshake: wgPeer.lastHandshake,
                isActive: metrics.isActive,
                timestamp: now,
              }),
            );
          }

          // ── 6. Collect DB writes ──────────────────────────────────────────

          if (saveToDb) {
            handshakeUpdates.push({ id: dbPeer.id, lastHandshake: wgPeer.lastHandshake });

            trafficInserts.push({
              peerId: dbPeer.id,
              serverId: server.id,
              rxBytes: metrics.adjustedRx,
              txBytes: metrics.adjustedTx,
              lastHandshake: wgPeer.lastHandshake,
              endpoint: wgPeer.endpoint,
              timestamp: now,
            });

            speedInserts.push({
              peerId: dbPeer.id,
              serverId: server.id,
              rxSpeedBps: metrics.rxSpeed,
              txSpeedBps: metrics.txSpeed,
              isActive: metrics.isActive,
              timestamp: now,
            });
          }

          // ── Accumulate server totals ──────────────────────────────────────

          srvRx += metrics.adjustedRx;
          srvTx += metrics.adjustedTx;
          srvRxSpeed += metrics.rxSpeed;
          srvTxSpeed += metrics.txSpeed;
          if (metrics.isActive) srvActivePeers += 1;
        }

        // ── 5. Server-level dead-band check ───────────────────────────────

        const emitServer = this.needsUpdate(
          this.lastServerSocketEmit.get(server.id),
          srvRxSpeed,
          srvTxSpeed,
          srvRx,
          srvTx,
          nowMs,
          this.SOCKET_MAX_SILENCE_MS,
          this.SOCKET_DEADBAND_BPS,
        );

        if (emitServer) {
          this.lastServerSocketEmit.set(server.id, {
            rxSpeedBps: srvRxSpeed,
            txSpeedBps: srvTxSpeed,
            rxBytes: srvRx,
            txBytes: srvTx,
            timestamp: nowMs,
          });

          this.eventBus.emit(
            new WgServerStatsUpdatedEvent({
              serverId: server.id,
              interface: server.interface,
              totalRxBytes: srvRx,
              totalTxBytes: srvTx,
              rxSpeedBps: srvRxSpeed,
              txSpeedBps: srvTxSpeed,
              peerCount: srvTrackedPeers,
              activePeerCount: srvActivePeers,
              timestamp: now,
            }),
          );
        }

        globalRx += srvRx;
        globalTx += srvTx;
        globalRxSpeed += srvRxSpeed;
        globalTxSpeed += srvTxSpeed;
        totalTrackedPeers += srvTrackedPeers;
        totalActivePeers += srvActivePeers;
      }

      // ── 6. Batch persist to DB ─────────────────────────────────────────────

      await Promise.all([
        trafficInserts.length > 0
          ? this.trafficRepo.save(trafficInserts as WgTrafficStat[])
          : Promise.resolve(),
        speedInserts.length > 0
          ? this.speedRepo.save(speedInserts as WgSpeedSample[])
          : Promise.resolve(),
        handshakeUpdates.length > 0
          ? this.peerRepo.bulkUpdateLastHandshake(handshakeUpdates)
          : Promise.resolve(),
      ]);

      // ── 7. Emit WgOverviewStatsUpdatedEvent ───────────────────────────────────

      const overviewChanged = this.needsUpdate(
        this.lastOverviewSocketEmit,
        globalRxSpeed,
        globalTxSpeed,
        globalRx,
        globalTx,
        nowMs,
        this.SOCKET_MAX_SILENCE_MS,
        this.SOCKET_DEADBAND_BPS,
        totalActivePeers,
      );

      if (!overviewChanged) return;

      this.lastOverviewSocketEmit = {
        rxSpeedBps: globalRxSpeed,
        txSpeedBps: globalTxSpeed,
        rxBytes: globalRx,
        txBytes: globalTx,
        timestamp: nowMs,
        activePeers: totalActivePeers,
      };

      this.eventBus.emit(
        new WgOverviewStatsUpdatedEvent({
          totalServers: servers.length,
          activeServers: upServers.length,
          totalPeers: totalTrackedPeers,
          activePeers: totalActivePeers,
          totalRxBytes: globalRx,
          totalTxBytes: globalTx,
          rxSpeedBps: globalRxSpeed,
          txSpeedBps: globalTxSpeed,
          timestamp: now,
        }),
      );
    } catch (err) {
      logger.error({ err }, "[WgStats] Poll error");
    }
  }

  // ─── Metric computation ───────────────────────────────────────────────────────

  /**
   * Computes speed and reset-safe adjusted byte counters for a single peer.
   *
   * WireGuard resets rx/tx counters to 0 when the interface is restarted.
   * To keep values monotonically increasing, a cumulative offset is maintained:
   *   - Counter drop detected (raw < prev): offset += previous raw value
   *   - No prev snapshot (first tick after app restart): restore from last DB value
   */
  private computePeerMetrics(
    wgPeer: WgPeerStats,
    peerId: string,
    nowMs: number,
  ): PeerMetrics {
    const prev = this.prevSnapshots.get(peerId);
    const lastKnown = this.lastKnownDb.get(peerId);

    const rxOffset = prev
      ? wgPeer.rxBytes < prev.rxBytes
        ? prev.rxOffset + prev.rxBytes // WG counter reset
        : prev.rxOffset
      : Math.max(0, (lastKnown?.rxBytes ?? 0) - wgPeer.rxBytes); // app restart

    const txOffset = prev
      ? wgPeer.txBytes < prev.txBytes
        ? prev.txOffset + prev.txBytes
        : prev.txOffset
      : Math.max(0, (lastKnown?.txBytes ?? 0) - wgPeer.txBytes);

    const adjustedRx = wgPeer.rxBytes + rxOffset;
    const adjustedTx = wgPeer.txBytes + txOffset;

    let rxSpeed = 0;
    let txSpeed = 0;

    if (prev) {
      const dtSec = (nowMs - prev.timestamp) / 1000;

      if (dtSec > 0) {
        const prevAdjustedRx = prev.rxBytes + prev.rxOffset;
        const prevAdjustedTx = prev.txBytes + prev.txOffset;

        rxSpeed = Math.max(0, (adjustedRx - prevAdjustedRx) / dtSec);
        txSpeed = Math.max(0, (adjustedTx - prevAdjustedTx) / dtSec);
      }
    }

    const isActive =
      wgPeer.lastHandshake !== null &&
      nowMs - wgPeer.lastHandshake.getTime() < WG_PEER_ACTIVE_THRESHOLD_MS;

    return { adjustedRx, adjustedTx, rxSpeed, txSpeed, rxOffset, txOffset, isActive };
  }

  // ─── Dead-band checks ─────────────────────────────────────────────────────────

  /**
   * Returns true if a socket emission should be sent for this peer.
   * Updates the cached snapshot on positive result.
   */
  private checkSocketDeadband(
    key: string,
    rxSpeedBps: number,
    txSpeedBps: number,
    rxBytes: number,
    txBytes: number,
    nowMs: number,
  ): boolean {
    const should = this.needsUpdate(
      this.lastSocketEmit.get(key),
      rxSpeedBps,
      txSpeedBps,
      rxBytes,
      txBytes,
      nowMs,
      this.SOCKET_MAX_SILENCE_MS,
      this.SOCKET_DEADBAND_BPS,
    );

    if (should) {
      this.lastSocketEmit.set(key, { rxSpeedBps, txSpeedBps, rxBytes, txBytes, timestamp: nowMs });
    }

    return should;
  }

  /**
   * Returns true if a DB write should be performed for this peer.
   * Updates the cached snapshot on positive result.
   */
  private checkDbDeadband(
    key: string,
    rxSpeedBps: number,
    txSpeedBps: number,
    rxBytes: number,
    txBytes: number,
    nowMs: number,
  ): boolean {
    const should = this.needsUpdate(
      this.lastDbSave.get(key),
      rxSpeedBps,
      txSpeedBps,
      rxBytes,
      txBytes,
      nowMs,
      this.DB_MAX_SILENCE_MS,
      this.DB_DEADBAND_BPS,
    );

    if (should) {
      this.lastDbSave.set(key, { rxSpeedBps, txSpeedBps, rxBytes, txBytes, timestamp: nowMs });
    }

    return should;
  }

  /** Core dead-band test: true when value has changed enough or silence expired. */
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
    if (activePeers !== undefined && activePeers !== last.activePeers) return true;

    return (
      Math.abs(rxSpeedBps - last.rxSpeedBps) > deadbandBps ||
      Math.abs(txSpeedBps - last.txSpeedBps) > deadbandBps
    );
  }

  // ─── Active state change detection ───────────────────────────────────────────

  /**
   * Emits WgPeerActiveChangedEvent only when isActive transitions.
   * Always emits on first observation (after restart) to sync client state.
   */
  private emitActiveChangedIfNeeded(
    peerId: string,
    serverId: string,
    isActive: boolean,
    lastHandshake: Date | null,
  ): void {
    const prev = this.prevActiveState.get(peerId);

    if (prev === undefined || prev !== isActive) {
      this.prevActiveState.set(peerId, isActive);
      this.eventBus.emit(
        new WgPeerActiveChangedEvent(peerId, serverId, isActive, lastHandshake),
      );
    }
  }

  // ─── Purge ────────────────────────────────────────────────────────────────────

  /** Purge stats older than retentionDays */
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
