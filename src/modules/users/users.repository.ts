// src/modules/users/repositories/users.repository.ts
import { inject, injectable } from "inversify";
import { Repository } from "typeorm";

import { User, UserRole } from "./user.entity";

@injectable()
export class UsersRepository {
  repository: Repository<User>;

  constructor(@inject("DataSource") dataSource: any) {
    this.repository = dataSource.getRepository(User);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  async findAdmins(): Promise<User[]> {
    return this.repository.find({
      // where: { role: UserRole.ADMIN },
      // relations: ["posts"],
    });
  }

  async findWithPosts(userId: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id: userId },
      // relations: ["posts"],
    });
  }
}
