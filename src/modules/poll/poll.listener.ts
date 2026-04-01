import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
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
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
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

    this._eventBus.on(PollVotedEvent, async (event: PollVotedEvent) => {
      const memberUserIds = await this._memberRepo.getMemberUserIds(event.chatId);

      for (const userId of memberUserIds) {
        this._emitter.toUser(
          userId,
          "poll:voted",
          new PollDto(event.poll, userId),
        );
      }
    });

    this._eventBus.on(PollClosedEvent, async (event: PollClosedEvent) => {
      const memberUserIds = await this._memberRepo.getMemberUserIds(event.chatId);

      for (const userId of memberUserIds) {
        this._emitter.toUser(
          userId,
          "poll:closed",
          new PollDto(event.poll, userId),
        );
      }
    });
  }
}
