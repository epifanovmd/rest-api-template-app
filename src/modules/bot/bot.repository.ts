import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Bot } from "./bot.entity";

@InjectableRepository(Bot)
export class BotRepository extends BaseRepository<Bot> {
  async findByToken(token: string) {
    return this.findOne({
      where: { token, isActive: true },
      relations: { commands: true },
    });
  }

  async findByUsername(username: string) {
    return this.findOne({ where: { username } });
  }

  async findByOwnerId(ownerId: string) {
    return this.find({
      where: { ownerId },
      order: { createdAt: "DESC" },
    });
  }

  async findByIdWithDetails(id: string) {
    return this.findOne({
      where: { id },
      relations: { commands: true, avatar: true },
    });
  }
}
