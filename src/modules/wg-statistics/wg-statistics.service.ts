import { inject } from "inversify";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import {
  WgOverviewStatsPayload,
  WgPeerStatsPayload,
  WgServerStatsPayload,
} from "../socket/socket.types";
import {
  WgCliService,
  WgPeerStats,
  WgShowOutput,
} from "../wg-cli/wg-cli.service";
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
import { WgSpeedSampleRepository } from "./wg-speed-sample.repository";
import { AggregatedFilters } from "./wg-statistics.types";
import { WgTrafficStat } from "./wg-traffic-stat.entity";
import { WgTrafficStatRepository } from "./wg-traffic-stat.repository";

// ─── Внутренние типы состояния ────────────────────────────────────────────────

interface PeerPrevSnapshot {
  rxBytes: number;
  txBytes: number;
  /** Накопленное смещение при сбросах счётчиков WireGuard */
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

// ─── Сервис ───────────────────────────────────────────────────────────────────

/** Сервис сбора и публикации статистики WireGuard: скорость, трафик, активность пиров. */
@Injectable()
export class WgStatisticsService {
  // ─── Состояние в памяти ─────────────────────────────────────────────────────

  /** Предыдущие счётчики WireGuard по каждому пиру — используются для расчёта скорости */
  private prevSnapshots = new Map<string, PeerPrevSnapshot>();

  /**
   * Последние скорректированные байты, загруженные из БД при запуске.
   * Восстанавливает монотонные счётчики байт после перезапуска приложения/WG.
   */
  private lastKnownDb = new Map<string, { rxBytes: number; txBytes: number }>();

  /** Предыдущее isActive по каждому пиру — используется для определения переходов активности */
  private prevActiveState = new Map<string, boolean>();

  // ─── Конфигурация мёртвой зоны ───────────────────────────────────────────────
  //
  // Socket: отправлять если скорость изменилась > 256 bps ИЛИ тишина > 30 с.
  // DB:     сохранять если скорость изменилась > 1024 bps ИЛИ байты изменились ИЛИ тишина > 60 с.

  private readonly SOCKET_DEADBAND_BPS = 256;
  private readonly SOCKET_MAX_SILENCE_MS = 30_000;
  private readonly DB_DEADBAND_BPS = 1024;
  private readonly DB_MAX_SILENCE_MS = 60_000;

  // ─── Состояние мёртвой зоны ──────────────────────────────────────────────────

  private lastSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastDbSave = new Map<string, DeadbandSnapshot>();
  private lastServerSocketEmit = new Map<string, DeadbandSnapshot>();
  private lastOverviewSocketEmit: DeadbandSnapshot | undefined;

  // ─── Кэш последних известных данных (для HTTP-эндпоинтов снимков) ────────────

  private lastOverviewSnapshot: WgOverviewStatsPayload | null = null;
  private lastServerSnapshots = new Map<string, WgServerStatsPayload>();
  private lastPeerSnapshots = new Map<string, WgPeerStatsPayload>();

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

  // ─── Инициализация ───────────────────────────────────────────────────────────

  /**
   * Загружает последние известные скорректированные байты из БД для всех пиров одним запросом.
   * Вызывается один раз при инициализации, чтобы правильно восстановить смещения после перезапуска.
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

  // ─── Основной тик опроса ─────────────────────────────────────────────────────

  /**
   * Основной тик опроса — вызывается WgStatisticsBootstrap по интервалу.
   *
   * Шаги:
   *  1. Получить актуальные данные WireGuard для всех запущенных серверов
   *  2. По каждому пиру: вычислить скорость и скорректированные байты (монотонно, без сбросов)
   *  3. По каждому пиру: проверить мёртвую зону → решить что отправить / сохранить
   *  4. По каждому пиру: определить переход isActive → вызвать WgPeerActiveChangedEvent
   *  5. По каждому серверу: накопить итоги, проверить мёртвую зону сервера
   *  6. Пакетно сохранить снимки трафика, сэмплы скорости, lastHandshake в БД
   *  7. Вызвать WgStatsUpdatedEvent для рассылки через сокет
   */
  async poll(persistToDb = true): Promise<void> {
    try {
      const servers = await this.serverRepo.findAllEnabled();
      const upServers = servers.filter(s => s.status === EWgServerStatus.UP);

      if (upServers.length === 0) return;

      const now = new Date();
      const nowMs = now.getTime();

      // Строим карту public_key → пир из БД один раз для всего тика
      const allPeers = await this.peerRepo.find();
      const peerByPublicKey = new Map(allPeers.map(p => [p.publicKey, p]));

      // Глобальные аккумуляторы для сводки
      let globalRx = 0;
      let globalTx = 0;
      let globalRxSpeed = 0;
      let globalTxSpeed = 0;
      let totalTrackedPeers = 0;
      let totalActivePeers = 0;

      // Буферы пакетной записи — заполняются по каждому пиру, сбрасываются после всех серверов
      const trafficInserts: Partial<WgTrafficStat>[] = [];
      const speedInserts: Partial<WgSpeedSample>[] = [];
      const handshakeUpdates: Array<{
        id: string;
        lastHandshake: Date | null;
      }> = [];

      // ── 1. Перебираем запущенные серверы ──────────────────────────────────────

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

          // ── 2. Вычисляем скорость + скорректированные байты ──────────────

          const metrics = this.computePeerMetrics(wgPeer, dbPeer.id, nowMs);

          this.prevSnapshots.set(dbPeer.id, {
            rxBytes: wgPeer.rxBytes,
            txBytes: wgPeer.txBytes,
            rxOffset: metrics.rxOffset,
            txOffset: metrics.txOffset,
            timestamp: nowMs,
          });

          // ── 3. Проверяем мёртвую зону → решаем что обновить ──────────────

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

          // ── 4. Определяем переход isActive → вызываем доменное событие ────

          this.emitActiveChangedIfNeeded(
            dbPeer.id,
            server.id,
            metrics.isActive,
            wgPeer.lastHandshake,
          );

          // ── 5. Вызываем событие статистики пира ────────────────────────────

          if (emitToSocket) {
            const peerPayload = {
              peerId: dbPeer.id,
              serverId: server.id,
              rxBytes: metrics.adjustedRx,
              txBytes: metrics.adjustedTx,
              rxSpeedBps: metrics.rxSpeed,
              txSpeedBps: metrics.txSpeed,
              lastHandshake: wgPeer.lastHandshake,
              isActive: metrics.isActive,
              timestamp: now,
            };

            this.lastPeerSnapshots.set(dbPeer.id, peerPayload);
            this.eventBus.emit(new WgPeerStatsUpdatedEvent(peerPayload));
          }

          // ── 6. Собираем записи для БД ─────────────────────────────────────

          if (saveToDb) {
            handshakeUpdates.push({
              id: dbPeer.id,
              lastHandshake: wgPeer.lastHandshake,
            });

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

          // ── Накапливаем итоги по серверу ────────────────────────────────────

          srvRx += metrics.adjustedRx;
          srvTx += metrics.adjustedTx;
          srvRxSpeed += metrics.rxSpeed;
          srvTxSpeed += metrics.txSpeed;
          if (metrics.isActive) srvActivePeers += 1;
        }

        // ── 5. Проверка мёртвой зоны на уровне сервера ──────────────────

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

          const serverPayload = {
            serverId: server.id,
            interface: server.interface,
            totalRxBytes: srvRx,
            totalTxBytes: srvTx,
            rxSpeedBps: srvRxSpeed,
            txSpeedBps: srvTxSpeed,
            peerCount: srvTrackedPeers,
            activePeerCount: srvActivePeers,
            timestamp: now,
          };

          this.lastServerSnapshots.set(server.id, serverPayload);
          this.eventBus.emit(new WgServerStatsUpdatedEvent(serverPayload));
        }

        globalRx += srvRx;
        globalTx += srvTx;
        globalRxSpeed += srvRxSpeed;
        globalTxSpeed += srvTxSpeed;
        totalTrackedPeers += srvTrackedPeers;
        totalActivePeers += srvActivePeers;
      }

      // ── 6. Пакетное сохранение в БД ────────────────────────────────────────

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

      // ── 7. Вызываем WgOverviewStatsUpdatedEvent ──────────────────────────────

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

      const overviewPayload = {
        totalServers: servers.length,
        activeServers: upServers.length,
        totalPeers: totalTrackedPeers,
        activePeers: totalActivePeers,
        totalRxBytes: globalRx,
        totalTxBytes: globalTx,
        rxSpeedBps: globalRxSpeed,
        txSpeedBps: globalTxSpeed,
        timestamp: now,
      };

      this.lastOverviewSnapshot = overviewPayload;
      this.eventBus.emit(new WgOverviewStatsUpdatedEvent(overviewPayload));
    } catch (err) {
      logger.error({ err }, "[WgStats] Poll error");
    }
  }

  // ─── Вычисление метрик ───────────────────────────────────────────────────────

  /**
   * Вычисляет скорость и скорректированные счётчики байт для одного пира, устойчивые к сбросам.
   *
   * WireGuard сбрасывает счётчики rx/tx в 0 при перезапуске интерфейса.
   * Для сохранения монотонного роста поддерживается накопленное смещение:
   *   - Обнаружен сброс счётчика (raw < prev): offset += предыдущее raw значение
   *   - Нет предыдущего снимка (первый тик после перезапуска): восстанавливаем из последнего значения БД
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
        ? prev.rxOffset + prev.rxBytes // сброс счётчика WG
        : prev.rxOffset
      : Math.max(0, (lastKnown?.rxBytes ?? 0) - wgPeer.rxBytes); // перезапуск приложения

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

    return {
      adjustedRx,
      adjustedTx,
      rxSpeed,
      txSpeed,
      rxOffset,
      txOffset,
      isActive,
    };
  }

  // ─── Проверки мёртвой зоны ───────────────────────────────────────────────────

  /**
   * Возвращает true, если нужно отправить событие через сокет для данного пира.
   * Обновляет кэшированный снимок при положительном результате.
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
      this.lastSocketEmit.set(key, {
        rxSpeedBps,
        txSpeedBps,
        rxBytes,
        txBytes,
        timestamp: nowMs,
      });
    }

    return should;
  }

  /**
   * Возвращает true, если нужно выполнить запись в БД для данного пира.
   * Обновляет кэшированный снимок при положительном результате.
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
      this.lastDbSave.set(key, {
        rxSpeedBps,
        txSpeedBps,
        rxBytes,
        txBytes,
        timestamp: nowMs,
      });
    }

    return should;
  }

  /** Основная проверка мёртвой зоны: true если значение изменилось достаточно или истекло молчание. */
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

    // Всегда отправлять при падении скорости до нуля, чтобы клиент не продолжал
    // отображать последнюю ненулевую скорость после остановки активности.
    if (
      (last.rxSpeedBps > 0 && rxSpeedBps === 0) ||
      (last.txSpeedBps > 0 && txSpeedBps === 0)
    )
      return true;

    return (
      Math.abs(rxSpeedBps - last.rxSpeedBps) > deadbandBps ||
      Math.abs(txSpeedBps - last.txSpeedBps) > deadbandBps
    );
  }

  // ─── Определение изменения состояния активности ──────────────────────────────

  /**
   * Вызывает WgPeerActiveChangedEvent только при переходе isActive.
   * Всегда вызывается при первом наблюдении (после перезапуска) для синхронизации состояния клиента.
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

  // ─── Очистка ──────────────────────────────────────────────────────────────────

  /** Удаляет статистику старше retentionDays */
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

  // ─── Геттеры снимков для начальной загрузки страницы ─────────────────────────

  /** Вернуть последний снимок сводной статистики (для HTTP-эндпоинта начальной загрузки). */
  getCurrentOverview(): WgOverviewStatsPayload | null {
    return this.lastOverviewSnapshot;
  }

  /** Вернуть последний снимок статистики конкретного сервера. */
  getCurrentServer(serverId: string): WgServerStatsPayload | null {
    return this.lastServerSnapshots.get(serverId) ?? null;
  }

  /** Вернуть последний снимок статистики конкретного пира. */
  getCurrentPeer(peerId: string): WgPeerStatsPayload | null {
    return this.lastPeerSnapshots.get(peerId) ?? null;
  }

  // ─── Методы запросов для HTTP-эндпоинтов ─────────────────────────────────────

  /** Получить последнюю запись трафика пира из БД. */
  async getLatestPeerStats(peerId: string): Promise<WgTrafficStat[]> {
    return this.trafficRepo.getLatestByPeer(peerId, 1);
  }

  /** Получить последний сэмпл скорости пира из БД. */
  async getLatestPeerSpeed(peerId: string): Promise<WgSpeedSample[]> {
    return this.speedRepo.getLatestByPeer(peerId, 1);
  }

  /**
   * Агрегированная история трафика + скорости для отрисовки графиков.
   *
   * - overview: без фильтров
   * - server:   { serverId } (+ опциональный peerId)
   * - peer:     { peerId }
   */
  async getAggregatedHistory(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<{
    traffic: Array<{ timestamp: Date; rxBytes: number; txBytes: number }>;
    speed: Array<{ timestamp: Date; rxSpeedBps: number; txSpeedBps: number }>;
  }> {
    const [traffic, speed] = await Promise.all([
      this.trafficRepo.getAggregatedInRange(from, to, filters),
      this.speedRepo.getAggregatedInRange(from, to, filters),
    ]);

    return { traffic, speed };
  }
}
