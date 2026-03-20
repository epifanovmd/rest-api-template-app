import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgPeer } from "./wg-peer.entity";

@InjectableRepository(WgPeer)
export class WgPeerRepository extends BaseRepository<WgPeer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgPeer);
  }

  findByServer(
    serverId: string,
    skip?: number,
    take?: number,
  ): Promise<[WgPeer[], number]> {
    return this.findAndCount({
      where: { serverId },
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  findByUser(
    userId: string,
    skip?: number,
    take?: number,
  ): Promise<[WgPeer[], number]> {
    return this.findAndCount({
      where: { userId },
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  findEnabledByServer(serverId: string): Promise<WgPeer[]> {
    return this.find({ where: { serverId, enabled: true } });
  }

  async bulkUpdateLastHandshake(
    updates: Array<{ id: string; lastHandshake: Date | null }>,
  ): Promise<void> {
    await Promise.all(
      updates.map(({ id, lastHandshake }) => this.update({ id }, { lastHandshake })),
    );
  }

  findExpired(): Promise<WgPeer[]> {
    return this.createQueryBuilder("peer")
      .where("peer.expires_at IS NOT NULL")
      .andWhere("peer.expires_at < NOW()")
      .andWhere("peer.enabled = TRUE")
      .getMany();
  }
}
