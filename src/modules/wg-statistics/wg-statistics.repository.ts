import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgSpeedSample } from "./wg-speed-sample.entity";
import { WgTrafficStat } from "./wg-traffic-stat.entity";

@InjectableRepository(WgTrafficStat)
export class WgTrafficStatRepository extends BaseRepository<WgTrafficStat> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgTrafficStat);
  }

  async getLatestByPeer(
    peerId: string,
    limit = 100,
  ): Promise<WgTrafficStat[]> {
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
  ): Promise<WgTrafficStat[]> {
    return this.createQueryBuilder("s")
      .where("s.server_id = :serverId", { serverId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .orderBy("s.timestamp", "ASC")
      .getMany();
  }

  async getOverviewInRange(
    from: Date,
    to: Date,
  ): Promise<Array<{ timestamp: Date; rxBytes: number; txBytes: number }>> {
    return this.createQueryBuilder("s")
      .select("date_trunc('minute', s.timestamp)", "timestamp")
      .addSelect("CAST(SUM(s.rx_bytes) AS float8)", "rxBytes")
      .addSelect("CAST(SUM(s.tx_bytes) AS float8)", "txBytes")
      .where("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .groupBy("date_trunc('minute', s.timestamp)")
      .orderBy("date_trunc('minute', s.timestamp)", "ASC")
      .getRawMany();
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
  ): Promise<WgSpeedSample[]> {
    return this.createQueryBuilder("s")
      .where("s.server_id = :serverId", { serverId })
      .andWhere("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .orderBy("s.timestamp", "ASC")
      .getMany();
  }

  async getOverviewInRange(
    from: Date,
    to: Date,
  ): Promise<Array<{ timestamp: Date; rxSpeedBps: number; txSpeedBps: number }>> {
    return this.createQueryBuilder("s")
      .select("date_trunc('minute', s.timestamp)", "timestamp")
      .addSelect("CAST(SUM(s.rx_speed_bps) AS float8)", "rxSpeedBps")
      .addSelect("CAST(SUM(s.tx_speed_bps) AS float8)", "txSpeedBps")
      .where("s.timestamp >= :from", { from })
      .andWhere("s.timestamp <= :to", { to })
      .groupBy("date_trunc('minute', s.timestamp)")
      .orderBy("date_trunc('minute', s.timestamp)", "ASC")
      .getRawMany();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}
