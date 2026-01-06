import { BaseRepository, InjectableRepository } from "../../core";
import { ResetPasswordTokens } from "./reset-password-tokens.entity";

@InjectableRepository(ResetPasswordTokens)
export class ResetPasswordTokensRepository extends BaseRepository<ResetPasswordTokens> {
  async findByUserId(userId: string): Promise<ResetPasswordTokens | null> {
    return this.findOne({ where: { userId } });
  }

  async findByToken(token: string): Promise<ResetPasswordTokens | null> {
    return this.findOne({
      where: { token },
      relations: { user: true },
    });
  }
}
