import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { UserKey } from "./user-key.entity";

@InjectableRepository(UserKey)
export class UserKeyRepository extends BaseRepository<UserKey> {
  async findActiveKeys(userId: string) {
    return this.find({ where: { userId, isActive: true } });
  }

  async findByDevice(userId: string, deviceId: string) {
    return this.findOne({ where: { userId, deviceId } });
  }
}
