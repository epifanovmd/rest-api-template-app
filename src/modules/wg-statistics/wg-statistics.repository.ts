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

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("timestamp < :date", { date })
      .execute();

    return result.affected ?? 0;
  }
}
