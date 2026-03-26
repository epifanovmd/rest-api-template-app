import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ContactRequestEvent } from "../contact/events";
import { MessageCreatedEvent } from "../message/events";
import { ISocketEventListener, SocketClientRegistry } from "../socket";
import { PushService } from "./push.service";

@Injectable()
export class PushListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(PushService) private readonly _pushService: PushService,
    @inject(SocketClientRegistry)
    private readonly _clientRegistry: SocketClientRegistry,
  ) {}

  register(): void {
    // Новое сообщение → push offline участникам
    this._eventBus.on(
      MessageCreatedEvent,
      async (event: MessageCreatedEvent) => {
        const offlineUserIds = event.memberUserIds.filter(
          uid =>
            uid !== event.message.senderId &&
            !this._clientRegistry.isOnline(uid),
        );

        if (offlineUserIds.length === 0) return;

        const senderName =
          event.message.sender?.profile?.firstName ?? "Новое сообщение";
        const body =
          event.message.content?.slice(0, 100) ?? "Медиа-сообщение";

        await this._pushService.sendToUsers(offlineUserIds, {
          title: senderName,
          body,
          data: {
            type: "message",
            chatId: event.chatId,
            messageId: event.message.id,
          },
        });
      },
    );

    // Запрос контакта → push
    this._eventBus.on(
      ContactRequestEvent,
      async (event: ContactRequestEvent) => {
        if (this._clientRegistry.isOnline(event.targetUserId)) return;

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
  }
}
