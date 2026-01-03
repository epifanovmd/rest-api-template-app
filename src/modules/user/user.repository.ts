// user.repository.ts
import { inject, injectable } from "inversify";
import {
  DataSource,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  Repository,
} from "typeorm";

import { Injectable } from "../../core";
import { User } from "./user.entity";

@Injectable()
export class UserRepository {
  private repository: Repository<User>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(User);
  }

  // Основные методы поиска
  async findById(
    id: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations,
    });
  }

  async findByEmail(
    email: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
      relations,
    });
  }

  async findByPhone(
    phone: string,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: { phone },
      relations,
    });
  }

  async findByEmailOrPhone(
    email: string | null,
    phone: string | null,
    relations?: FindOptionsRelations<User>,
  ): Promise<User | null> {
    const where: FindOptionsWhere<User>[] = [];

    if (email) where.push({ email });
    if (phone) where.push({ phone });

    if (where.length === 0) return null;

    return this.repository.findOne({
      where,
      relations,
    });
  }

  async findAll(
    offset?: number,
    limit?: number,
    relations?: FindOptionsRelations<User>,
  ): Promise<[User[], number]> {
    return this.repository.findAndCount({
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
      relations,
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.repository.create(userData);

    return this.repository.save(user);
  }

  async update(id: string, updateData: Partial<User>): Promise<User | null> {
    await this.repository.update(id, updateData);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}
