import { DataSource, FindOptionsWhere, ILike } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { IWgServerFilters } from "./dto";
import { WgServer } from "./wg-server.entity";

/** Репозиторий для работы с WireGuard-серверами. */
@InjectableRepository(WgServer)
export class WgServerRepository extends BaseRepository<WgServer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgServer);
  }

  /** Найти сервер по имени интерфейса WireGuard. */
  findByInterface(interfaceName: string): Promise<WgServer | null> {
    return this.findOne({ where: { interface: interfaceName } });
  }

  /** Получить все серверы с флагом enabled = true. */
  findAllEnabled(): Promise<WgServer[]> {
    return this.find({ where: { enabled: true } });
  }

  /** Получить список серверов с фильтрацией, пагинацией и подсчётом общего числа записей. */
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

  /** Получить список серверов конкретного пользователя с фильтрацией и пагинацией. */
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

  /** Получить список серверов пользователя в формате id+name для выпадающего списка. */
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

  /** Получить все серверы в формате id+name для выпадающего списка. */
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
