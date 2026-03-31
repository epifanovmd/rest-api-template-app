import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { ProfileRepository } from "./profile.repository";

/** Сервис для управления временем последнего онлайна пользователя. */
@Injectable()
export class PresenceService {
  constructor(
    @inject(ProfileRepository)
    private readonly _profileRepository: ProfileRepository,
  ) {}

  /** Записать lastOnline при уходе пользователя в оффлайн. */
  async setOffline(userId: string): Promise<void> {
    await this._profileRepository
      .update({ userId }, { lastOnline: new Date() })
      .catch(err => {
        logger.error({ err, userId }, "[Presence] Failed to set lastOnline");
      });
  }
}
