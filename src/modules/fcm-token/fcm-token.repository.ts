import { BaseRepository, InjectableRepository } from "../../core";
import { FcmToken } from "./fcm-token.entity";

@InjectableRepository(FcmToken)
export class FcmTokenRepository extends BaseRepository<FcmToken> {
  async findById(id: number): Promise<FcmToken | null> {
    return this.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<FcmToken[]> {
    return this.find({ where: { userId } });
  }

  async findByToken(token: string): Promise<FcmToken | null> {
    return this.findOne({ where: { token } });
  }
}
