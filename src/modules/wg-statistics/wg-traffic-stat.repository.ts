import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import {
  AggregatedFilters,
  AggregatedTrafficPoint,
} from "./wg-statistics.types";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

/** Репозиторий для работы со снимками трафика WireGuard-пиров. */
@InjectableRepository(WgTrafficStat)
export class WgTrafficStatRepository extends BaseRepository<WgTrafficStat> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgTrafficStat);
  }

  /** Получить последние записи трафика для пира в порядке убывания времени. */
  async getLatestByPeer(peerId: string, limit = 100): Promise<WgTrafficStat[]> {
    return this.find({
      where: { peerId },
      order: { timestamp: "DESC" },
      take: limit,
    });
  }

  /**
   * Последняя запись трафика по каждому пиру одним запросом.
   * Используется при старте для восстановления монотонных счётчиков байт после перезапуска.
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

  /** Получить все записи трафика пира в указанном временном диапазоне. */
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

  /** Получить все записи трафика сервера в указанном диапазоне, опционально фильтруя по пиру. */
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
   * Агрегированный трафик по минутам для графиков.
   *
   * rx_bytes/tx_bytes — кумулятивные счётчики. Для каждой минуты берётся последнее
   * известное значение по каждому пиру и суммируется. Пропущенные минуты заполняются
   * вперёд последним известным значением (fill-forward), чтобы не было провалов
   * из-за фильтрации мёртвой зоны.
   *
   * Перед началом диапазона подтягивается последнее известное значение каждого пира
   * (seeds) — это предотвращает искусственный провал первой точки, когда у пира нет
   * записи точно на границе диапазона.
   *
   * raw → seeds → raw_seeded → generate_series → CROSS JOIN → fill-forward (COUNT + FIRST_VALUE) → SUM
   */
  async getAggregatedInRange(
    from: Date,
    to: Date,
    filters?: AggregatedFilters,
  ): Promise<AggregatedTrafficPoint[]> {
    const params: (Date | string | string[])[] = [from, to];
    const conditions = ["timestamp >= $1", "timestamp <= $2"];
    const filterConditions: string[] = [];

    if (filters?.serverId) {
      filterConditions.push(`server_id = $${params.push(filters.serverId)}`);
    } else if (filters?.serverIds?.length) {
      filterConditions.push(
        `server_id = ANY($${params.push(filters.serverIds)})`,
      );
    }

    if (filters?.peerId) {
      filterConditions.push(`peer_id = $${params.push(filters.peerId)}`);
    } else if (filters?.peerIds?.length) {
      filterConditions.push(`peer_id = ANY($${params.push(filters.peerIds)})`);
    }

    const where = [...conditions, ...filterConditions].join(" AND ");
    const seedsWhere = ["timestamp < $1", ...filterConditions].join(" AND ");

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
          seeds AS (
            SELECT DISTINCT ON (COALESCE(peer_id::text, id::text))
              COALESCE(peer_id::text, id::text)        AS peer_key,
              date_trunc('minute', $1::timestamptz)    AS minute,
              rx_bytes,
              tx_bytes
            FROM wg_traffic_stats
            WHERE ${seedsWhere}
            ORDER BY
              COALESCE(peer_id::text, id::text),
              timestamp DESC
          ),
          raw_seeded AS (
            SELECT * FROM raw
            UNION ALL
            SELECT s.* FROM seeds s
            WHERE NOT EXISTS (
              SELECT 1 FROM raw r
              WHERE r.peer_key = s.peer_key AND r.minute = s.minute
            )
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
            FROM (SELECT DISTINCT peer_key FROM raw_seeded) p
            CROSS JOIN slots s
            LEFT JOIN raw_seeded r ON r.peer_key = p.peer_key AND r.minute = s.minute
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
              minute,
              FIRST_VALUE(rx_bytes) OVER (PARTITION BY peer_key, grp ORDER BY minute) AS rx_bytes,
              FIRST_VALUE(tx_bytes) OVER (PARTITION BY peer_key, grp ORDER BY minute) AS tx_bytes
            FROM grouped
          )
        SELECT
          minute                        AS timestamp,
          CAST(SUM(rx_bytes) AS float8) AS "rxBytes",
          CAST(SUM(tx_bytes) AS float8) AS "txBytes"
        FROM filled
        WHERE rx_bytes IS NOT NULL
        GROUP BY minute
        ORDER BY minute ASC
      `,
      params,
    );
  }

  /** Удалить записи трафика старше указанной даты и вернуть количество удалённых строк. */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}
