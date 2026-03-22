import { DataSource, FindOptionsWhere, ILike } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { IWgServerFilters } from "./dto";
import { WgServer } from "./wg-server.entity";

@InjectableRepository(WgServer)
export class WgServerRepository extends BaseRepository<WgServer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgServer);
  }

  findByInterface(interfaceName: string): Promise<WgServer | null> {
    return this.findOne({ where: { interface: interfaceName } });
  }

  findAllEnabled(): Promise<WgServer[]> {
    return this.find({ where: { enabled: true } });
  }

  findFiltered(
    filters: IWgServerFilters,
    skip?: number,
    take?: number,
  ): Promise<[WgServer[], number]> {
    const where: FindOptionsWhere<WgServer> = {};

    if (filters.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.query) {
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
    filters: IWgServerFilters,
    skip?: number,
    take?: number,
  ): Promise<[WgServer[], number]> {
    const where: FindOptionsWhere<WgServer> = { userId };

    if (filters.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.query) {
      where.name = ILike(`%${filters.query}%`);
    }

    return this.findAndCount({
      where,
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  findOptionsByUser(
    userId: string,
    query?: string,
  ): Promise<Pick<WgServer, "id" | "name">[]> {
    const qb = this.createQueryBuilder("s")
      .select(["s.id", "s.name"])
      .where("s.user_id = :userId", { userId })
      .orderBy("s.name", "ASC");

    if (query) {
      qb.andWhere("s.name ILIKE :q", { q: `%${query}%` });
    }

    return qb.getMany();
  }

  findOptions(query?: string): Promise<Pick<WgServer, "id" | "name">[]> {
    const qb = this.createQueryBuilder("s")
      .select(["s.id", "s.name"])
      .orderBy("s.name", "ASC");

    if (query) {
      qb.where("s.name ILIKE :q", { q: `%${query}%` });
    }

    return qb.getMany();
  }
}
