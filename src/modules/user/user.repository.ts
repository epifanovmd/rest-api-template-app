import { FindOptionsRelations, FindOptionsWhere, ILike } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { BaseRepository, InjectableRepository } from "../../core";
import { IUserOptionDto } from "./dto";
import { User } from "./user.entity";

@InjectableRepository(User)
export class UserRepository extends BaseRepository<User> {
  async findById(
    id: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async findByEmail(
    email: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { email },
      relations,
    });
  }

  async findByPhone(
    phone: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.findOne({
      where: { phone },
      relations,
    });
  }

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

  async updateWithResponse(
    id: string,
    updateData: QueryDeepPartialEntity<User>,
  ): Promise<User | null> {
    await this.update(id, updateData);

    return this.findOne({
      where: { id },
    });
  }

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
