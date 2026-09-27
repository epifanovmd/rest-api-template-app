import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { NotificationSettingsDto } from "./dto";
import { NotificationSettingsChangedEvent } from "./events";
import { NotificationSettings } from "./notification-settings.entity";
import { NotificationSettingsRepository } from "./notification-settings.repository";

/** Совпадают с дефолтами колонок `notification_settings`. */
const DEFAULT_NOTIFICATION_SETTINGS = {
  muteAll: false,
  soundEnabled: true,
  showPreview: true,
};

@Injectable()
export class NotificationSettingsService {
  constructor(
    @inject(NotificationSettingsRepository)
    private _settingsRepo: NotificationSettingsRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  /** Настройки пользователя; если их ещё нет — дефолты без записи в БД. */
  async getSettings(userId: string) {
    const settings =
      (await this._settingsRepo.findByUserId(userId)) ??
      Object.assign(new NotificationSettings(), {
        userId,
        ...DEFAULT_NOTIFICATION_SETTINGS,
      });

    return NotificationSettingsDto.fromEntity(settings);
  }

  async updateSettings(
    userId: string,
    data: {
      muteAll?: boolean;
      soundEnabled?: boolean;
      showPreview?: boolean;
    },
  ) {
    const settings = await this._settingsRepo.upsertSettings(userId, data);

    this._eventBus.emit(new NotificationSettingsChangedEvent(userId, settings));

    return NotificationSettingsDto.fromEntity(settings);
  }
}
