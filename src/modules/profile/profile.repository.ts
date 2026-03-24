import { BaseRepository, InjectableRepository } from "../../core";
import { Profile } from "./profile.entity";

/** Репозиторий для работы с профилями пользователей. */
@InjectableRepository(Profile)
export class ProfileRepository extends BaseRepository<Profile> {
  /** Найти профиль по ID, подгружая связанного пользователя. */
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  /** Найти профиль по идентификатору пользователя, подгружая связанного пользователя. */
  async findByUserId(userId: string) {
    return this.findOne({
      where: { userId },
      relations: { user: true },
    });
  }
}
