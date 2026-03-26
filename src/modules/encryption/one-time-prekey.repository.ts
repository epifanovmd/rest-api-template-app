import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { OneTimePreKey } from "./one-time-prekey.entity";

@InjectableRepository(OneTimePreKey)
export class OneTimePreKeyRepository extends BaseRepository<OneTimePreKey> {
  async getNextAvailable(userId: string) {
    const key = await this.findOne({
      where: { userId, isUsed: false },
      order: { keyId: "ASC" },
    });

    if (key) {
      key.isUsed = true;
      await this.save(key);
    }

    return key;
  }

  async countAvailable(userId: string) {
    return this.count({ where: { userId, isUsed: false } });
  }
}
