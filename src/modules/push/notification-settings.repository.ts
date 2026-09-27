import { In } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { NotificationSettings } from "./notification-settings.entity";

@InjectableRepository(NotificationSettings)
export class NotificationSettingsRepository extends BaseRepository<NotificationSettings> {
  async findByUserId(userId: string) {
    return this.findOne({ where: { userId } });
  }

  async findByUserIds(userIds: string[]): Promise<NotificationSettings[]> {
    if (userIds.length === 0) return [];

    return this.find({ where: { userId: In(userIds) } });
  }

  /** Атомарный upsert по `user_id` — параллельные запросы не конфликтуют. */
  async upsertSettings(
    userId: string,
    data: Partial<
      Pick<NotificationSettings, "muteAll" | "soundEnabled" | "showPreview">
    >,
  ) {
    await this.upsert(
      { userId, ...data },
      { conflictPaths: ["userId"], skipUpdateIfNoValuesChanged: true },
    );

    return this.findOneOrFail({ where: { userId } });
  }
}
