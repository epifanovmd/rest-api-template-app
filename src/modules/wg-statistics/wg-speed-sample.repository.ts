import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgSpeedSample } from "./wg-speed-sample.entity";
import { AggregatedFilters, AggregatedSpeedPoint } from "./wg-statistics.types";

/** Репозиторий для работы с сэмплами скорости WireGuard-пиров. */
@InjectableRepository(WgSpeedSample)
export class WgSpeedSampleRepository extends BaseRepository<WgSpeedSample> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgSpeedSample);
  }

  /** Получить последние сэмплы скорости для пира в порядке убывания времени. */
  async getLatestByPeer(peerId: string, limit = 100): Promise<WgSpeedSample[]> {
    return this.find({
      where: { peerId },
      order: { timestamp: "DESC" },
      take: limit,
    });
  }

  /** Получить сэмплы скорости пира в указанном временном диапазоне. */
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

  /** Получить сэмплы скорости сервера в указанном диапазоне, опционально фильтруя по пиру. */
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
   * Агрегированная скорость по минутам для отрисовки графиков.
   *
   * Берёт ПОСЛЕДНИЙ сэмпл по каждому пиру в каждом минутном интервале, затем суммирует по пирам.
   * Поддерживает опциональный фильтр по серверу/пиру.
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
        SELECT DISTINCT ON (COALESCE(peer_id::text, id::text), date_trunc('minute', timestamp))
          date_trunc('minute', timestamp) AS minute,
          rx_speed_bps,
          tx_speed_bps
        FROM wg_speed_samples
        WHERE ${conditions.join(" AND ")}
        ORDER BY COALESCE(peer_id::text, id::text), date_trunc('minute', timestamp), timestamp DESC
      ) AS latest
      GROUP BY minute
      ORDER BY minute ASC
      `,
      params,
    );
  }

  /** Удалить сэмплы скорости старше указанной даты и вернуть количество удалённых строк. */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}
