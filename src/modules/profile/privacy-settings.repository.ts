import { In } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { PrivacySettings } from "./privacy-settings.entity";

@InjectableRepository(PrivacySettings)
export class PrivacySettingsRepository extends BaseRepository<PrivacySettings> {
  async findByUserId(userId: string) {
    return this.findOne({ where: { userId } });
  }

  async findByUserIds(userIds: string[]): Promise<PrivacySettings[]> {
    if (userIds.length === 0) return [];

    return this.find({ where: { userId: In(userIds) } });
  }

  /**
   * Настройки пользователя; при отсутствии создаются с дефолтами.
   * `ON CONFLICT DO NOTHING` — параллельные запросы не падают на уникальности.
   */
  async findOrCreate(userId: string): Promise<PrivacySettings> {
    const existing = await this.findByUserId(userId);

    if (existing) return existing;

    await this.createQueryBuilder()
      .insert()
      .into(PrivacySettings)
      .values({ userId })
      .orIgnore()
      .execute();

    return this.findOneOrFail({ where: { userId } });
  }
}
