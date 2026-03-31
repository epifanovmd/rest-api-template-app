import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ContactRepository } from "../contact/contact.repository";
import { EContactStatus } from "../contact/contact.types";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { UserOfflineEvent, UserOnlineEvent } from "./events";
import { PresenceService } from "./presence.service";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { PrivacySettingsService } from "./privacy-settings.service";

/**
 * Слушатель событий присутствия.
 * При online/offline:
 * 1. Обновляет status и lastOnline в БД
 * 2. Рассылает user:online / user:offline:
 *    - собеседникам direct-чатов (всегда, как в Telegram)
 *    - контактам (с учётом настроек приватности showLastOnline)
 */
@Injectable()
export class PresenceListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
    @inject(PresenceService)
    private readonly presenceService: PresenceService,
    @inject(ContactRepository)
    private readonly contactRepo: ContactRepository,
    @inject(ChatMemberRepository)
    private readonly chatMemberRepo: ChatMemberRepository,
    @inject(PrivacySettingsService)
    private readonly privacyService: PrivacySettingsService,
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

  /**
   * Собирает получателей и рассылает событие присутствия.
   *
   * Получатели (как в Telegram):
   * 1. Все собеседники по direct-чатам — всегда получают уведомление
   * 2. Контакты — с учётом настройки showLastOnline (everyone/contacts/nobody)
   *
   * При showLastOnline=nobody — не уведомляем вообще никого.
   */
  private async notifySubscribers(
    userId: string,
    event: "user:online" | "user:offline",
    payload: { userId: string; lastOnline?: Date },
  ): Promise<void> {
    try {
      const settings = await this.privacyService.getSettings(userId);

      if (settings.showLastOnline === EPrivacyLevel.NOBODY) {
        return;
      }

      const recipientIds = new Set<string>();

      // 1. Собеседники direct-чатов — видят статус всегда
      const directPartnerIds =
        await this.chatMemberRepo.findDirectChatPartnerIds(userId);

      for (const id of directPartnerIds) {
        recipientIds.add(id);
      }

      // 2. Контакты (при privacy = CONTACTS добавляем только взаимных контактов,
      //    при EVERYONE — тоже, но direct-партнёры уже покрыли основной кейс)
      if (settings.showLastOnline === EPrivacyLevel.EVERYONE) {
        const contacts = await this.contactRepo.findAllForUser(
          userId,
          EContactStatus.ACCEPTED,
        );

        for (const c of contacts) {
          recipientIds.add(c.contactUserId);
        }

        const reverseContacts = await this.contactRepo.find({
          where: { contactUserId: userId, status: EContactStatus.ACCEPTED },
        });

        for (const c of reverseContacts) {
          recipientIds.add(c.userId);
        }
      }

      for (const recipientId of recipientIds) {
        this.emitter.toUser(recipientId, event, payload);
      }
    } catch (err) {
      logger.error(
        { err, userId },
        `[Presence] Failed to notify subscribers on ${event}`,
      );
    }
  }
}
