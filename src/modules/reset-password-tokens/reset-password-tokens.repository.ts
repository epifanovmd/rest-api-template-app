import { BaseRepository, InjectableRepository } from "../../core";
import { ResetPasswordTokens } from "./reset-password-tokens.entity";

/** Репозиторий для работы с токенами сброса пароля. */
@InjectableRepository(ResetPasswordTokens)
export class ResetPasswordTokensRepository extends BaseRepository<ResetPasswordTokens> {
  /** Найти токен сброса пароля по идентификатору пользователя. */
  async findByUserId(userId: string): Promise<ResetPasswordTokens | null> {
    return this.findOne({ where: { userId } });
  }

  /** Найти токен сброса пароля по значению токена, подгружая связанного пользователя. */
  async findByToken(token: string): Promise<ResetPasswordTokens | null> {
    return this.findOne({
      where: { token },
      relations: { user: true },
    });
  }
}
