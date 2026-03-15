import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgPeer } from "./wg-peer.entity";

@InjectableRepository(WgPeer)
export class WgPeerRepository extends BaseRepository<WgPeer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgPeer);
  }

  findByServer(serverId: string): Promise<WgPeer[]> {
    return this.find({
      where: { serverId },
      order: { createdAt: "ASC" },
    });
  }

  findByUser(userId: string): Promise<WgPeer[]> {
    return this.find({
      where: { userId },
      order: { createdAt: "ASC" },
    });
  }

  findEnabledByServer(serverId: string): Promise<WgPeer[]> {
    return this.find({ where: { serverId, enabled: true } });
  }

  findExpired(): Promise<WgPeer[]> {
    return this.createQueryBuilder("peer")
      .where("peer.expires_at IS NOT NULL")
      .andWhere("peer.expires_at < NOW()")
      .andWhere("peer.enabled = TRUE")
      .getMany();
  }
}
