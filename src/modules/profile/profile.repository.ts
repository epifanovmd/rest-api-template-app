import { BaseRepository, InjectableRepository, Pagination } from "../../core";
import { Profile } from "./profile.entity";

/** Репозиторий для работы с профилями пользователей. */
@InjectableRepository(Profile)
export class ProfileRepository extends BaseRepository<Profile> {
  /** Найти профиль по ID, подгружая пользователя и аватар. */
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: { user: true, avatar: true },
    });
  }

  /** Найти профиль по идентификатору пользователя, подгружая пользователя и аватар. */
  async findByUserId(userId: string) {
    return this.findOne({
      where: { userId },
      relations: { user: true, avatar: true },
    });
  }

  /** Страница профилей с пользователями и аватарами, новые первыми. */
  async findPage({ offset, limit }: Pagination): Promise<[Profile[], number]> {
    return this.createQueryBuilder("profile")
      .leftJoinAndSelect("profile.user", "user")
      .leftJoinAndSelect("profile.avatar", "avatar")
      .orderBy("profile.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }
}
