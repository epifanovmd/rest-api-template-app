import { FindOptionsWhere } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { User } from "../user/user.entity";
import { Contact } from "./contact.entity";
import { EContactStatus } from "./contact.types";

@InjectableRepository(Contact)
export class ContactRepository extends BaseRepository<Contact> {
  async findByUserPair(userId: string, contactUserId: string) {
    return this.findOne({
      where: { userId, contactUserId },
      relations: { contactUser: { profile: { avatar: true } } },
    });
  }

  /** Контакты пользователя постранично (новые первыми). */
  async findAllForUser(
    userId: string,
    status: EContactStatus | undefined,
    offset: number,
    limit: number,
  ) {
    const where: FindOptionsWhere<Contact> = { userId };

    if (status) {
      where.status = status;
    }

    return this.findAndCount({
      where,
      relations: { contactUser: { profile: { avatar: true } } },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: { contactUser: { profile: { avatar: true } } },
    });
  }

  /** Существует ли пользователь. */
  async userExists(userId: string): Promise<boolean> {
    return this.manager.getRepository(User).exists({ where: { id: userId } });
  }
}
