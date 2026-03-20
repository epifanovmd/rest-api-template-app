import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgSpeedSample } from "./wg-speed-sample.entity";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

export interface AggregatedTrafficPoint {
  timestamp: Date;
  rxBytes: number;
  txBytes: number;
}

export interface AggregatedSpeedPoint {
  timestamp: Date;
  rxSpeedBps: number;
  txSpeedBps: number;
}

export interface AggregatedFilters {
  serverId?: string;
  peerId?: string;
}

@InjectableRepository(WgTrafficStat)
export class WgTrafficStatRepository extends BaseRepository<WgTrafficStat> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgTrafficStat);
  }

  async getLatestByPeer(peerId: string, limit = 100): Promise<WgTrafficStat[]> {
    return this.find({
      where: { peerId },
      order: { timestamp: "DESC" },
      take: limit,
    });
  }

  /**
   * Returns the single most-recent traffic record per peer in one query.
   * Used at bootstrap to restore monotonic byte offsets after restarts.
   */
  async getLatestPerPeer(): Promise<
    Array<{ peerId: string; rxBytes: number; txBytes: number }>
  > {
    return this.createQueryBuilder("s")
      .select("DISTINCT ON (s.peer_id) s.peer_id", "peerId")
      .addSelect("CAST(s.rx_bytes AS float8)", "rxBytes")
      .addSelect("CAST(s.tx_bytes AS float8)", "txBytes")
      .orderBy("s.peer_id", "ASC")
      .addOrderBy("s.timestamp", "DESC")
      .getRawMany();
  }

  async getByPeerInRange(
    peerId: string,
    from: Date,
    to: Date,
  ): Promise<WgTrafficStat[]> {
    return this.createQueryBuilder("s")
      .where("s.peer_id = :peerId", { peerId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .orderBy("s.timestamp", "ASC")
      .getMany();
  }

  async getByServerInRange(
    serverId: string,
    from: Date,
    to: Date,
    peerId?: string,
  ): Promise<WgTrafficStat[]> {
    const queryBuilder = this.createQueryBuilder("s")
      .where("s.server_id = :serverId", { serverId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to });

    if (peerId) {
      queryBuilder.andWhere("s.peer_id = :peerId", { peerId });
    }

    return queryBuilder.orderBy("s.timestamp", "ASC").getMany();
  }

  /**
   * Aggregated traffic by minute for chart rendering.
   *
   * rx_bytes/tx_bytes are cumulative counters — takes the LATEST value per peer
   * per minute bucket, then sums across peers. Supports optional server/peer filter.
   */
  async getAggregatedInRange(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<AggregatedTrafficPoint[]> {
    const params: (Date | string)[] = [from, to];
    const conditions = ["timestamp >= $1", "timestamp <= $2"];

    if (filters?.serverId) {
      conditions.push(`server_id = $${params.push(filters.serverId)}`);
    }
    if (filters?.peerId) {
      conditions.push(`peer_id = $${params.push(filters.peerId)}`);
    }

    return this.manager.query(
      `
      SELECT
        minute AS timestamp,
        CAST(SUM(rx_bytes) AS float8) AS "rxBytes",
        CAST(SUM(tx_bytes) AS float8) AS "txBytes"
      FROM (
        SELECT DISTINCT ON (peer_id, date_trunc('minute', timestamp))
          date_trunc('minute', timestamp) AS minute,
          rx_bytes,
          tx_bytes
        FROM wg_traffic_stats
        WHERE ${conditions.join(" AND ")}
        ORDER BY peer_id, date_trunc('minute', timestamp), timestamp DESC
      ) AS latest
      GROUP BY minute
      ORDER BY minute ASC
      `,
      params,
    );
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}

@InjectableRepository(WgSpeedSample)
export class WgSpeedSampleRepository extends BaseRepository<WgSpeedSample> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgSpeedSample);
  }

  async getLatestByPeer(peerId: string, limit = 100): Promise<WgSpeedSample[]> {
    return this.find({
      where: { peerId },
      order: { timestamp: "DESC" },
      take: limit,
    });
  }

  async getByPeerInRange(
    peerId: string,
    from: Date,
    to: Date,
  ): Promise<WgSpeedSample[]> {
    return this.createQueryBuilder("s")
      .where("s.peer_id = :peerId", { peerId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .orderBy("s.timestamp", "ASC")
      .getMany();
  }

  async getByServerInRange(
    serverId: string,
    from: Date,
    to: Date,
    peerId?: string,
  ): Promise<WgSpeedSample[]> {
    const queryBuilder = this.createQueryBuilder("s")
      .where("s.server_id = :serverId", { serverId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to });

    if (peerId) {
      queryBuilder.andWhere("s.peer_id = :peerId", { peerId });
    }

    return queryBuilder.orderBy("s.timestamp", "ASC").getMany();
  }

  /**
   * Aggregated speed by minute for chart rendering.
   *
   * Takes the LATEST sample per peer per minute bucket, then sums across peers.
   * Supports optional server/peer filter.
   */
  async getAggregatedInRange(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<AggregatedSpeedPoint[]> {
    const params: (Date | string)[] = [from, to];
    const conditions = ["timestamp >= $1", "timestamp <= $2"];

    if (filters?.serverId) {
      conditions.push(`server_id = $${params.push(filters.serverId)}`);
    }
    if (filters?.peerId) {
      conditions.push(`peer_id = $${params.push(filters.peerId)}`);
    }

    return this.manager.query(
      `
      SELECT
        minute AS timestamp,
        CAST(SUM(rx_speed_bps) AS float8) AS "rxSpeedBps",
        CAST(SUM(tx_speed_bps) AS float8) AS "txSpeedBps"
      FROM (
        SELECT DISTINCT ON (peer_id, date_trunc('minute', timestamp))
          date_trunc('minute', timestamp) AS minute,
          rx_speed_bps,
          tx_speed_bps
        FROM wg_speed_samples
        WHERE ${conditions.join(" AND ")}
        ORDER BY peer_id, date_trunc('minute', timestamp), timestamp DESC
      ) AS latest
      GROUP BY minute
      ORDER BY minute ASC
      `,
      params,
    );
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}
