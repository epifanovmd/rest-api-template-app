import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { IWgPeerFilters } from "./dto";
import { WgPeer } from "./wg-peer.entity";

@InjectableRepository(WgPeer)
export class WgPeerRepository extends BaseRepository<WgPeer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgPeer);
  }

  private withUserJoin(alias: string) {
    return this.createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.user`, "u")
      .leftJoinAndSelect("u.profile", "p");
  }

  findOneWithUser(id: string): Promise<WgPeer | null> {
    return this.withUserJoin("peer")
      .where("peer.id = :id", { id })
      .getOne();
  }

  findAll(
    skip?: number,
    take?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    const qb = this.withUserJoin("peer").orderBy("peer.createdAt", "ASC");

    if (filters?.enabled !== undefined) {
      qb.andWhere("peer.enabled = :enabled", { enabled: filters.enabled });
    }
    if (filters?.status !== undefined) {
      qb.andWhere("peer.status = :status", { status: filters.status });
    }
    if (filters?.serverId) {
      qb.andWhere("peer.server_id = :serverId", { serverId: filters.serverId });
    }
    if (filters?.userId) {
      qb.andWhere("peer.user_id = :userId", { userId: filters.userId });
    }
    if (filters?.query) {
      qb.andWhere("peer.name ILIKE :query", { query: `%${filters.query}%` });
    }
    if (skip !== undefined) qb.skip(skip);
    if (take !== undefined) qb.take(take);

    return qb.getManyAndCount();
  }

  findByServer(
    serverId: string,
    skip?: number,
    take?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    const qb = this.withUserJoin("peer")
      .where("peer.server_id = :serverId", { serverId })
      .orderBy("peer.createdAt", "ASC");

    if (filters?.enabled !== undefined) {
      qb.andWhere("peer.enabled = :enabled", { enabled: filters.enabled });
    }
    if (filters?.status !== undefined) {
      qb.andWhere("peer.status = :status", { status: filters.status });
    }
    if (filters?.query) {
      qb.andWhere("peer.name ILIKE :query", { query: `%${filters.query}%` });
    }
    if (skip !== undefined) qb.skip(skip);
    if (take !== undefined) qb.take(take);

    return qb.getManyAndCount();
  }

  findByUser(
    userId: string,
    skip?: number,
    take?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    const qb = this.withUserJoin("peer")
      .where("peer.user_id = :userId", { userId })
      .orderBy("peer.createdAt", "ASC");

    if (filters?.enabled !== undefined) {
      qb.andWhere("peer.enabled = :enabled", { enabled: filters.enabled });
    }
    if (filters?.status !== undefined) {
      qb.andWhere("peer.status = :status", { status: filters.status });
    }
    if (filters?.serverId) {
      qb.andWhere("peer.server_id = :serverId", { serverId: filters.serverId });
    }
    if (filters?.query) {
      qb.andWhere("peer.name ILIKE :query", { query: `%${filters.query}%` });
    }
    if (skip !== undefined) qb.skip(skip);
    if (take !== undefined) qb.take(take);

    return qb.getManyAndCount();
  }

  findEnabledByServer(serverId: string): Promise<WgPeer[]> {
    return this.find({ where: { serverId, enabled: true } });
  }

  async bulkUpdateLastHandshake(
    updates: Array<{ id: string; lastHandshake: Date | null }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    const ids = updates.map(u => u.id);
    const handshakes = updates.map(u => u.lastHandshake);

    await this.manager.query(
      `UPDATE wg_peers
       SET last_handshake = v.last_handshake
       FROM (
         SELECT unnest($1::uuid[]) AS id,
                unnest($2::timestamptz[]) AS last_handshake
       ) v
       WHERE wg_peers.id = v.id`,
      [ids, handshakes],
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

  findOptionsByUser(
    userId: string,
    serverId?: string,
    query?: string,
  ): Promise<Pick<WgPeer, "id" | "name">[]> {
    const qb = this.createQueryBuilder("p")
      .select(["p.id", "p.name"])
      .where("p.user_id = :userId", { userId })
      .orderBy("p.name", "ASC");

    if (serverId) {
      qb.andWhere("p.server_id = :serverId", { serverId });
    }
    if (query) {
      qb.andWhere("p.name ILIKE :q", { q: `%${query}%` });
    }

    return qb.getMany();
  }
}
