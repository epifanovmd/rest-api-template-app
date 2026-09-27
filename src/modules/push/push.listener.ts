import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ContactRequestEvent } from "../contact/events";
import { MessageCreatedEvent } from "../message/events";
import { SessionTerminatedEvent } from "../session/events";
import {
  ISocketEventListener,
  SocketClientRegistry,
  SocketEmitterService,
} from "../socket";
import { DeviceTokenService } from "./device-token.service";
import { NotificationSettingsDto } from "./dto";
import { NotificationSettingsChangedEvent } from "./events";
import { PushService } from "./push.service";

const MESSAGE_HIDDEN_PREVIEW = {
  title: "Новое сообщение",
  body: "У вас новое сообщение",
};

const MENTION_HIDDEN_PREVIEW = {
  title: "Новое упоминание",
  body: "Вас упомянули в чате",
};

@Injectable()
export class PushListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(PushService) private readonly _pushService: PushService,
    @inject(SocketClientRegistry)
    private readonly _clientRegistry: SocketClientRegistry,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(DeviceTokenService)
    private readonly _deviceTokenService: DeviceTokenService,
  ) {}

  register(): void {
    // Новое сообщение → push offline участникам
    this._eventBus.on(
      MessageCreatedEvent,
      async (event: MessageCreatedEvent) => {
        const recipients = event.memberUserIds.filter(
          uid => uid !== event.message.senderId,
        );
        const online = new Set(
          await this._clientRegistry.filterOnline(recipients),
        );
        const candidateUserIds = recipients.filter(uid => !online.has(uid));

        if (candidateUserIds.length === 0) return;

        // Batch-загрузка memberships для проверки mute (вместо N+1)
        const now = new Date();
        const memberships = await this._memberRepo.findMembershipsByChat(
          event.chatId,
          candidateUserIds,
        );
        const mutedUserIds = new Set(
          memberships
            .filter(m => m.mutedUntil && m.mutedUntil > now)
            .map(m => m.userId),
        );
        const offlineUserIds = candidateUserIds.filter(
          uid => !mutedUserIds.has(uid),
        );

        if (offlineUserIds.length === 0) return;

        const senderName =
          event.message.sender?.profile?.firstName ?? "Новое сообщение";
        const body = event.message.content?.slice(0, 100) ?? "Медиа-сообщение";

        await this._pushService.sendToUsers(offlineUserIds, {
          title: senderName,
          body,
          hiddenPreview: MESSAGE_HIDDEN_PREVIEW,
          data: {
            type: "message",
            chatId: event.chatId,
            messageId: event.message.id,
          },
        });

        // Send mention push to muted users (bypass mute for mentions)
        if (event.mentionedUserIds.length > 0 || event.mentionAll) {
          const mutedMentioned = candidateUserIds.filter(
            uid => !offlineUserIds.includes(uid),
          );

          const mentionTargets = event.mentionAll
            ? mutedMentioned
            : mutedMentioned.filter(uid =>
                event.mentionedUserIds.includes(uid),
              );

          if (mentionTargets.length > 0) {
            await this._pushService.sendToUsers(mentionTargets, {
              title: `${senderName} упомянул вас`,
              body,
              hiddenPreview: MENTION_HIDDEN_PREVIEW,
              data: {
                type: "mention",
                chatId: event.chatId,
                messageId: event.message.id,
              },
            });
          }
        }
      },
    );

    // Запрос контакта → push
    this._eventBus.on(
      ContactRequestEvent,
      async (event: ContactRequestEvent) => {
        if (await this._clientRegistry.isOnline(event.targetUserId)) return;

        await this._pushService.sendToUser(event.targetUserId, {
          title: "Новый контакт",
          body: "Вам отправлен запрос на добавление в контакты",
          data: {
            type: "contact_request",
            contactId: event.contact.id,
          },
        });
      },
    );

    // Сессия завершена → её push-токены больше не действуют
    this._eventBus.on(
      SessionTerminatedEvent,
      async (event: SessionTerminatedEvent) => {
        await this._deviceTokenService.removeBySession(event.sessionId);
      },
    );

    // Настройки уведомлений изменены → socket
    this._eventBus.on(
      NotificationSettingsChangedEvent,
      (event: NotificationSettingsChangedEvent) => {
        this._emitter.toUser(
          event.userId,
          "push:settings-changed",
          NotificationSettingsDto.fromEntity(event.settings),
        );
      },
    );
  }
}
