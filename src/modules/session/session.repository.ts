import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Session } from "./session.entity";

@InjectableRepository(Session)
export class SessionRepository extends BaseRepository<Session> {
  async findByUserId(userId: string) {
    return this.find({
      where: { userId },
      order: { lastActiveAt: "DESC" },
    });
  }

  async findByRefreshToken(refreshToken: string) {
    return this.findOne({
      where: { refreshToken },
    });
  }
}
