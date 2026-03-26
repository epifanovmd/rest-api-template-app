import { Brackets, FindOptionsRelations, FindOptionsWhere, ILike } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { BaseRepository, InjectableRepository } from "../../core";
import { IUserOptionDto } from "./dto";
import { User } from "./user.entity";

/** Репозиторий для работы с пользователями. */
@InjectableRepository(User)
export class UserRepository extends BaseRepository<User> {
  /** Найти пользователя по ID с опциональными связями. */
  async findById(
    id: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  /** Найти пользователя по email с опциональными связями. */
  async findByEmail(
    email: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { email },
      relations,
    });
  }

  /** Найти пользователя по номеру телефона с опциональными связями. */
  async findByPhone(
    phone: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { phone },
      relations,
    });
  }

  /** Найти пользователя по email или телефону; возвращает null, если ни один параметр не передан. */
  async findByEmailOrPhone(
    email?: string,
    phone?: string,
    relations?: FindOptionsRelations<User>,
  ) {
    const where: FindOptionsWhere<User>[] = [];

    if (email) {
      where.push({ email });
    }
    if (phone) {
      where.push({ phone });
    }

    if (where.length === 0) {
      return null;
    }

    return this.findOne({
      where,
      relations,
    });
  }

  /** Обновить данные пользователя и вернуть обновлённую запись. */
  async updateWithResponse(
    id: string,
    updateData: QueryDeepPartialEntity<User>,
  ): Promise<User | null> {
    await this.update(id, updateData);

    return this.findOne({
      where: { id },
    });
  }

  /** Найти пользователя по username. */
  async findByUsername(
    username: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { username },
      relations,
    });
  }

  /** Поиск пользователей по запросу (ILIKE по username, email, firstName, lastName). */
  async searchByQuery(
    query: string,
    limit: number,
    offset: number,
  ): Promise<[User[], number]> {
    const qb = this.createQueryBuilder("user")
      .leftJoinAndSelect("user.profile", "profile")
      .leftJoinAndSelect("user.roles", "roles")
      .leftJoinAndSelect("roles.permissions", "rolePermissions")
      .leftJoinAndSelect("user.directPermissions", "directPermissions")
      .where(
        new Brackets(q => {
          q.where("user.username ILIKE :query", { query: `%${query}%` })
            .orWhere("user.email ILIKE :query", { query: `%${query}%` })
            .orWhere("profile.firstName ILIKE :query", { query: `%${query}%` })
            .orWhere("profile.lastName ILIKE :query", { query: `%${query}%` });
        }),
      )
      .orderBy("user.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    return qb.getManyAndCount();
  }

  /** Получить список пользователей для выпадающего списка с опциональной фильтрацией по строке запроса. */
  async findOptions(query?: string): Promise<IUserOptionDto[]> {
    const where: FindOptionsWhere<User>[] = query
      ? [
          { email: ILike(`%${query}%`) },
          { profile: { firstName: ILike(`%${query}%`) } },
          { profile: { lastName: ILike(`%${query}%`) } },
        ]
      : [];

    const users = await this.find({
      where: where.length ? where : undefined,
      select: { id: true, email: true, profile: { firstName: true, lastName: true } },
      relations: { profile: true },
      order: { email: "ASC" },
    });

    return users.map(u => ({
      id: u.id,
      name:
        [u.profile?.firstName, u.profile?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || u.email,
    }));
  }
}
