import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Contact } from "./contact.entity";
import { EContactStatus } from "./contact.types";

@InjectableRepository(Contact)
export class ContactRepository extends BaseRepository<Contact> {
  async findByUserPair(userId: string, contactUserId: string) {
    return this.findOne({
      where: { userId, contactUserId },
      relations: { contactUser: { profile: true } },
    });
  }

  async findAllForUser(userId: string, status?: EContactStatus) {
    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    return this.find({
      where,
      relations: { contactUser: { profile: true } },
      order: { createdAt: "DESC" },
    });
  }

  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: { contactUser: { profile: true } },
    });
  }
}
