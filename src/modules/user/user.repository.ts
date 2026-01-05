import { injectable, unmanaged } from "inversify";
import {
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { User } from "./user.entity";

@injectable()
export abstract class BaseRepository<T extends ObjectLiteral> {
  protected repository: Repository<T>;
  @IDataSource() protected dataSource: IDataSource;

  constructor(@unmanaged() entity: new () => T) {
    this.repository = this.dataSource.getRepository(entity);
  }
}

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
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
    email?: string,
    phone?: string,
    relations?: FindOptionsRelations<User>,
  ) {
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
  ): Promise<User[]> {
    return this.repository.find({
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
