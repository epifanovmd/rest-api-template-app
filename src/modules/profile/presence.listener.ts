import { inject, multiInject, optional } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { UserOfflineEvent, UserOnlineEvent } from "./events";
import { PresenceService } from "./presence.service";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { PrivacySettingsService } from "./privacy-settings.service";
import { IPresenceAudience, PRESENCE_AUDIENCE } from "./profile.relations";

/**
 * Слушатель событий присутствия: при online/offline обновляет `lastOnline` и
 * рассылает `user:online` / `user:offline` аудитории из модулей связей
 * (`PRESENCE_AUDIENCE`). При `showLastOnline = nobody` — никому.
 */
@Injectable()
export class PresenceListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
    @inject(PresenceService)
    private readonly presenceService: PresenceService,
    @inject(PrivacySettingsService)
    private readonly privacyService: PrivacySettingsService,
    @multiInject(PRESENCE_AUDIENCE)
    @optional()
    private readonly audiences: IPresenceAudience[] = [],
  ) {}

  register(): void {
    this.eventBus.on(UserOnlineEvent, (event: UserOnlineEvent) => {
      this.handleOnline(event.userId);
    });

    this.eventBus.on(UserOfflineEvent, (event: UserOfflineEvent) => {
      this.handleOffline(event.userId);
    });
  }

  private async handleOnline(userId: string): Promise<void> {
    await this.notifySubscribers(userId, "user:online", { userId });
  }

  private async handleOffline(userId: string): Promise<void> {
    const lastOnline = new Date();

    await this.presenceService.setOffline(userId);
    await this.notifySubscribers(userId, "user:offline", {
      userId,
      lastOnline,
    });
  }

  private async notifySubscribers(
    userId: string,
    event: "user:online" | "user:offline",
    payload: { userId: string; lastOnline?: Date },
  ): Promise<void> {
    try {
      const { showLastOnline } = await this.privacyService.getSettings(userId);

      if (showLastOnline === EPrivacyLevel.NOBODY) return;

      const lists = await Promise.all(
        this.audiences.map(audience =>
          audience.audience(userId, showLastOnline),
        ),
      );

      for (const recipientId of new Set(lists.flat())) {
        if (recipientId !== userId) {
          this.emitter.toUser(recipientId, event, payload);
        }
      }
    } catch (err) {
      logger.error(
        { err, userId },
        `[Presence] Failed to notify subscribers on ${event}`,
      );
    }
  }
}
