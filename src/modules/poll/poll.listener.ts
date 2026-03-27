import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { MessageDto } from "../message/dto";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { PollDto } from "./dto";
import { PollClosedEvent, PollCreatedEvent, PollVotedEvent } from "./events";

@Injectable()
export class PollListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(
      PollCreatedEvent,
      (event: PollCreatedEvent) => {
        const messageDto = MessageDto.fromEntity(event.message);

        // Отправляем сообщение с опросом в комнату чата
        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "message:new",
          messageDto,
        );

        // Уведомляем участников об обновлении непрочитанных
        for (const userId of event.memberUserIds) {
          if (userId !== event.message.senderId) {
            this._emitter.toUser(userId, "chat:unread", {
              chatId: event.chatId,
              unreadCount: -1,
            });
          }
        }
      },
    );

    this._eventBus.on(PollVotedEvent, (event: PollVotedEvent) => {
      const dto = new PollDto(event.poll);

      this._emitter.toRoom(`chat_${event.chatId}`, "poll:voted", dto);
    });

    this._eventBus.on(PollClosedEvent, (event: PollClosedEvent) => {
      const dto = new PollDto(event.poll);

      this._emitter.toRoom(`chat_${event.chatId}`, "poll:closed", dto);
    });
  }
}
