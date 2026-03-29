import { In } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { DeviceToken } from "./device-token.entity";

@InjectableRepository(DeviceToken)
export class DeviceTokenRepository extends BaseRepository<DeviceToken> {
  async findByUserId(userId: string) {
    return this.find({ where: { userId } });
  }

  async findByToken(token: string) {
    return this.findOne({ where: { token } });
  }

  async findByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];

    return this.find({ where: { userId: In(userIds) } });
  }

  async deleteByToken(token: string) {
    return this.delete({ token });
  }

  async deleteByTokens(tokens: string[]) {
    if (tokens.length === 0) return;

    return this.delete({ token: In(tokens) });
  }
}
