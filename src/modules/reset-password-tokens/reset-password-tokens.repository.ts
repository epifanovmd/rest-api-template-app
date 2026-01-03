import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { ResetPasswordTokens } from "./reset-password-tokens.entity";

@Injectable()
export class ResetPasswordTokensRepository {
  private repository: Repository<ResetPasswordTokens>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(ResetPasswordTokens);
  }

  async findByUserId(userId: string): Promise<ResetPasswordTokens | null> {
    return this.repository.findOne({ where: { userId } });
  }

  async findByToken(token: string): Promise<ResetPasswordTokens | null> {
    return this.repository.findOne({
      where: { token },
      relations: { user: true },
    });
  }

  async create(
    tokenData: Partial<ResetPasswordTokens>,
  ): Promise<ResetPasswordTokens> {
    const token = this.repository.create(tokenData);

    return this.repository.save(token);
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });

    return (result.affected || 0) > 0;
  }

  async save(token: ResetPasswordTokens): Promise<ResetPasswordTokens> {
    return this.repository.save(token);
  }
}
