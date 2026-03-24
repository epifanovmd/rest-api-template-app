import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { AggregatedFilters, AggregatedTrafficPoint } from "./wg-statistics.types";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

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
   * rx_bytes/tx_bytes are cumulative counters. For each minute bucket takes the
   * latest known value per peer and sums across peers. Missing minutes are filled
   * forward from the last recorded value to prevent dips caused by dead-band
   * filtering.
   *
   * Single table scan → generate_series time slots → LEFT JOIN → window
   * fill-forward (COUNT + FIRST_VALUE). No range-join CROSS JOIN.
   */
  async getAggregatedInRange(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<AggregatedTrafficPoint[]> {
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

    const where = conditions.join(" AND ");

    return this.manager.query(
      `
      WITH
        raw AS (
          SELECT DISTINCT ON (COALESCE(peer_id::text, id::text), date_trunc('minute', timestamp))
            COALESCE(peer_id::text, id::text) AS peer_key,
            date_trunc('minute', timestamp)   AS minute,
            rx_bytes,
            tx_bytes
          FROM wg_traffic_stats
          WHERE ${where}
          ORDER BY
            COALESCE(peer_id::text, id::text),
            date_trunc('minute', timestamp),
            timestamp DESC
        ),
        slots AS (
          SELECT generate_series(
            date_trunc('minute', $1::timestamptz),
            date_trunc('minute', $2::timestamptz),
            '1 minute'::interval
          ) AS minute
        ),
        expanded AS (
          SELECT
            p.peer_key,
            s.minute,
            r.rx_bytes,
            r.tx_bytes
          FROM (SELECT DISTINCT peer_key FROM raw) p
          CROSS JOIN slots s
          LEFT JOIN raw r ON r.peer_key = p.peer_key AND r.minute = s.minute
        ),
        grouped AS (
          SELECT
            peer_key,
            minute,
            rx_bytes,
            tx_bytes,
            COUNT(rx_bytes) OVER (PARTITION BY peer_key ORDER BY minute) AS grp
          FROM expanded
        ),
        filled AS (
          SELECT
            peer_key,
            minute,
            FIRST_VALUE(rx_bytes) OVER (PARTITION BY peer_key, grp ORDER BY minute) AS rx_bytes,
            FIRST_VALUE(tx_bytes) OVER (PARTITION BY peer_key, grp ORDER BY minute) AS tx_bytes
          FROM grouped
        ),
        deltas AS (
          SELECT
            minute,
            GREATEST(rx_bytes - LAG(rx_bytes) OVER (PARTITION BY peer_key ORDER BY minute), 0) AS rx_delta,
            GREATEST(tx_bytes - LAG(tx_bytes) OVER (PARTITION BY peer_key ORDER BY minute), 0) AS tx_delta
          FROM filled
          WHERE rx_bytes IS NOT NULL
        )
      SELECT
        minute                          AS timestamp,
        CAST(SUM(rx_delta) AS float8)   AS "rxBytes",
        CAST(SUM(tx_delta) AS float8)   AS "txBytes"
      FROM deltas
      WHERE rx_delta IS NOT NULL
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
