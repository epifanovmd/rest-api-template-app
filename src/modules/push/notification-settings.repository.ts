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

  async upsertSettings(
    userId: string,
    data: Partial<Pick<NotificationSettings, "muteAll" | "soundEnabled" | "showPreview">>,
  ) {
    const existing = await this.findByUserId(userId);

    if (existing) {
      Object.assign(existing, data);

      return this.save(existing);
    }

    return this.createAndSave({ userId, ...data });
  }
}
