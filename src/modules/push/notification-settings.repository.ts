import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { NotificationSettings } from "./notification-settings.entity";

@InjectableRepository(NotificationSettings)
export class NotificationSettingsRepository extends BaseRepository<NotificationSettings> {
  async findByUserId(userId: string) {
    return this.findOne({ where: { userId } });
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
