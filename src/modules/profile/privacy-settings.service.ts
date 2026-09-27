import { inject, multiInject, optional } from "inversify";

import { EventBus, Injectable } from "../../core";
import { PrivacySettingsUpdatedEvent } from "./events";
import { EPrivacyLevel, PrivacySettings } from "./privacy-settings.entity";
import { PrivacySettingsRepository } from "./privacy-settings.repository";
import { CONTACT_RELATION, IContactRelation } from "./profile.relations";

export type TPrivacyField = "showLastOnline" | "showPhone" | "showAvatar";

/** Значения по умолчанию — совпадают с дефолтами колонок `privacy_settings`. */
const DEFAULT_PRIVACY: Record<TPrivacyField, EPrivacyLevel> = {
  showLastOnline: EPrivacyLevel.EVERYONE,
  showPhone: EPrivacyLevel.CONTACTS,
  showAvatar: EPrivacyLevel.EVERYONE,
};

@Injectable()
export class PrivacySettingsService {
  constructor(
    @inject(PrivacySettingsRepository)
    private _repo: PrivacySettingsRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @multiInject(CONTACT_RELATION)
    @optional()
    private _contactRelations: IContactRelation[] = [],
  ) {}

  /** Настройки текущего пользователя (создаются при первом обращении). */
  async getSettings(userId: string): Promise<PrivacySettings> {
    return this._repo.findOrCreate(userId);
  }

  async updateSettings(
    userId: string,
    data: Partial<Record<TPrivacyField, EPrivacyLevel>>,
  ): Promise<PrivacySettings> {
    const settings = await this._repo.findOrCreate(userId);

    if (data.showLastOnline !== undefined) {
      settings.showLastOnline = data.showLastOnline;
    }
    if (data.showPhone !== undefined) {
      settings.showPhone = data.showPhone;
    }
    if (data.showAvatar !== undefined) {
      settings.showAvatar = data.showAvatar;
    }

    const saved = await this._repo.save(settings);

    this._eventBus.emit(new PrivacySettingsUpdatedEvent(userId, saved));

    return saved;
  }

  /** Может ли зритель видеть поле пользователя. Ничего не пишет в БД. */
  async canSeeField(
    viewerUserId: string,
    targetUserId: string,
    field: TPrivacyField,
  ): Promise<boolean> {
    if (viewerUserId === targetUserId) return true;

    const settings = await this._repo.findByUserId(targetUserId);
    const level = settings?.[field] ?? DEFAULT_PRIVACY[field];

    if (level === EPrivacyLevel.EVERYONE) return true;
    if (level === EPrivacyLevel.NOBODY) return false;

    const contacts = await this._contactsOf(viewerUserId, [targetUserId]);

    return contacts.has(targetUserId);
  }

  /** Пакетный вариант `canSeeField`: id пользователей, чьё поле видно зрителю. */
  async getVisibleUserIds(
    viewerUserId: string,
    targetUserIds: string[],
    field: TPrivacyField,
  ): Promise<Set<string>> {
    const ids = [...new Set(targetUserIds)];
    const visible = new Set<string>();

    if (ids.length === 0) return visible;

    const others = ids.filter(id => id !== viewerUserId);

    if (others.length < ids.length) visible.add(viewerUserId);
    if (others.length === 0) return visible;

    const settings = await this._repo.findByUserIds(others);
    const levelByUser = new Map(settings.map(s => [s.userId, s[field]]));
    const contactsOnly: string[] = [];

    for (const id of others) {
      const level = levelByUser.get(id) ?? DEFAULT_PRIVACY[field];

      if (level === EPrivacyLevel.EVERYONE) visible.add(id);
      else if (level === EPrivacyLevel.CONTACTS) contactsOnly.push(id);
    }

    if (contactsOnly.length > 0) {
      const contacts = await this._contactsOf(viewerUserId, contactsOnly);

      for (const id of contacts) visible.add(id);
    }

    return visible;
  }

  /** Из `userIds` — те, для кого зритель «контакт» хотя бы по одному модулю связей. */
  private async _contactsOf(
    viewerUserId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    const lists = await Promise.all(
      this._contactRelations.map(relation =>
        relation.contactsOf(viewerUserId, userIds),
      ),
    );

    return new Set(lists.flat());
  }
}
