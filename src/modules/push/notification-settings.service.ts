import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { NotificationSettingsDto } from "./dto";
import { NotificationSettingsChangedEvent } from "./events";
import { NotificationSettingsRepository } from "./notification-settings.repository";

@Injectable()
export class NotificationSettingsService {
  constructor(
    @inject(NotificationSettingsRepository)
    private _settingsRepo: NotificationSettingsRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async getSettings(userId: string) {
    let settings = await this._settingsRepo.findByUserId(userId);

    if (!settings) {
      settings = await this._settingsRepo.createAndSave({ userId });
    }

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
