import { DataSource, FindOptionsWhere, ILike } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { IWgPeerFilters } from "./dto";
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
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    const where: FindOptionsWhere<WgPeer> = { serverId };

    if (filters?.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters?.status !== undefined) {
      where.status = filters.status;
    }
    if (filters?.query) {
      where.name = ILike(`%${filters.query}%`);
    }

    return this.findAndCount({
      where,
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  findByUser(
    userId: string,
    skip?: number,
    take?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    const where: FindOptionsWhere<WgPeer> = { userId };

    if (filters?.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters?.status !== undefined) {
      where.status = filters.status;
    }
    if (filters?.serverId) {
      where.serverId = filters.serverId;
    }
    if (filters?.query) {
      where.name = ILike(`%${filters.query}%`);
    }

    return this.findAndCount({
      where,
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

  findOptions(
    serverId?: string,
    query?: string,
  ): Promise<Pick<WgPeer, "id" | "name">[]> {
    const qb = this.createQueryBuilder("p")
      .select(["p.id", "p.name"])
      .orderBy("p.name", "ASC");

    if (serverId) {
      qb.where("p.server_id = :serverId", { serverId });
    }
    if (query) {
      qb.andWhere("p.name ILIKE :q", { q: `%${query}%` });
    }

    return qb.getMany();
  }
}
