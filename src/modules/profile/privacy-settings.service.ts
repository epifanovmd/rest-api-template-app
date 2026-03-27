import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ContactRepository } from "../contact/contact.repository";
import { EContactStatus } from "../contact/contact.types";
import { PrivacySettingsUpdatedEvent } from "./events";
import {
  EPrivacyLevel,
  PrivacySettings,
} from "./privacy-settings.entity";
import { PrivacySettingsRepository } from "./privacy-settings.repository";

@Injectable()
export class PrivacySettingsService {
  constructor(
    @inject(PrivacySettingsRepository)
    private _repo: PrivacySettingsRepository,
    @inject(ContactRepository)
    private _contactRepo: ContactRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async getSettings(userId: string): Promise<PrivacySettings> {
    let settings = await this._repo.findByUserId(userId);

    if (!settings) {
      settings = await this._repo.createAndSave({ userId });
    }

    return settings;
  }

  async updateSettings(
    userId: string,
    data: {
      showLastOnline?: EPrivacyLevel;
      showPhone?: EPrivacyLevel;
      showAvatar?: EPrivacyLevel;
    },
  ): Promise<PrivacySettings> {
    let settings = await this._repo.findByUserId(userId);

    if (!settings) {
      settings = await this._repo.createAndSave({ userId, ...data });
    } else {
      if (data.showLastOnline !== undefined) {
        settings.showLastOnline = data.showLastOnline;
      }
      if (data.showPhone !== undefined) {
        settings.showPhone = data.showPhone;
      }
      if (data.showAvatar !== undefined) {
        settings.showAvatar = data.showAvatar;
      }

      await this._repo.save(settings);
    }

    this._eventBus.emit(new PrivacySettingsUpdatedEvent(userId));

    return settings;
  }

  async canSeeField(
    viewerUserId: string,
    targetUserId: string,
    field: "showLastOnline" | "showPhone" | "showAvatar",
  ): Promise<boolean> {
    if (viewerUserId === targetUserId) return true;

    const settings = await this.getSettings(targetUserId);
    const level = settings[field];

    if (level === EPrivacyLevel.EVERYONE) return true;
    if (level === EPrivacyLevel.NOBODY) return false;

    // CONTACTS level — check if they are contacts
    const contact = await this._contactRepo.findByUserPair(
      targetUserId,
      viewerUserId,
    );

    return contact?.status === EContactStatus.ACCEPTED;
  }
}
