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
  /** Filter by multiple server IDs (OR logic). Ignored if serverId is set. */
  serverIds?: string[];
  /** Filter by multiple peer IDs (OR logic). Ignored if peerId is set. */
  peerIds?: string[];
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
   * rx_bytes/tx_bytes are cumulative counters. Uses fill-forward: for each minute
   * bucket, takes the latest known value per peer (even if recorded in a prior
   * minute), then sums across peers. This prevents dips when a peer has no record
   * in a particular minute due to dead-band filtering.
   */
  async getAggregatedInRange(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<AggregatedTrafficPoint[]> {
    const params: (Date | string | string[])[] = [from, to];
    const rangeConditions = ["timestamp >= $1", "timestamp <= $2"];
    const joinExtra: string[] = [];

    if (filters?.serverId) {
      const idx = params.push(filters.serverId);

      rangeConditions.push(`server_id = $${idx}`);
      joinExtra.push(`s.server_id = $${idx}`);
    } else if (filters?.serverIds?.length) {
      const idx = params.push(filters.serverIds);

      rangeConditions.push(`server_id = ANY($${idx})`);
      joinExtra.push(`s.server_id = ANY($${idx})`);
    }

    if (filters?.peerId) {
      const idx = params.push(filters.peerId);

      rangeConditions.push(`peer_id = $${idx}`);
      joinExtra.push(`s.peer_id = $${idx}`);
    } else if (filters?.peerIds?.length) {
      const idx = params.push(filters.peerIds);

      rangeConditions.push(`peer_id = ANY($${idx})`);
      joinExtra.push(`s.peer_id = ANY($${idx})`);
    }

    const whereRange = rangeConditions.join(" AND ");
    const andJoin =
      joinExtra.length > 0 ? ` AND ${joinExtra.join(" AND ")}` : "";

    return this.manager.query(
      `
      WITH
        minutes AS (
          SELECT DISTINCT date_trunc('minute', timestamp) AS minute
          FROM wg_traffic_stats
          WHERE ${whereRange}
        ),
        peers AS (
          SELECT DISTINCT peer_id
          FROM wg_traffic_stats
          WHERE ${whereRange}
        ),
        filled AS (
          SELECT DISTINCT ON (p.peer_id, m.minute)
            m.minute,
            s.rx_bytes,
            s.tx_bytes
          FROM peers p
          CROSS JOIN minutes m
          JOIN wg_traffic_stats s
            ON s.peer_id = p.peer_id
            AND s.timestamp <= m.minute + INTERVAL '1 minute'
            ${andJoin}
          ORDER BY p.peer_id, m.minute, s.timestamp DESC
        )
      SELECT
        minute AS timestamp,
        CAST(SUM(rx_bytes) AS float8) AS "rxBytes",
        CAST(SUM(tx_bytes) AS float8) AS "txBytes"
      FROM filled
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
    const params: (Date | string | string[])[] = [from, to];
    const conditions = ["timestamp >= $1", "timestamp <= $2"];

    if (filters?.serverId) {
      conditions.push(`server_id = $${params.push(filters.serverId)}`);
    } else if (filters?.serverIds?.length) {
      conditions.push(`server_id = ANY($${params.push(filters.serverIds)})`);
    }

    if (filters?.peerId) {
      conditions.push(`peer_id = $${params.push(filters.peerId)}`);
    } else if (filters?.peerIds?.length) {
      conditions.push(`peer_id = ANY($${params.push(filters.peerIds)})`);
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
