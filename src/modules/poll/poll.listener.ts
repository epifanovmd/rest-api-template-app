import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { PollDto } from "./dto";
import { PollClosedEvent, PollVotedEvent } from "./events";

@Injectable()
export class PollListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
  ) {}

  /** message:new и chat:unread для опроса шлёт MessageListener — опрос создаётся как сообщение. */
  register(): void {
    this._eventBus.on(PollVotedEvent, async (event: PollVotedEvent) => {
      const memberUserIds = await this._memberRepo.getMemberUserIds(
        event.chatId,
      );

      for (const userId of memberUserIds) {
        this._emitter.toUser(
          userId,
          "poll:voted",
          new PollDto(event.poll, userId),
        );
      }
    });

    this._eventBus.on(PollClosedEvent, async (event: PollClosedEvent) => {
      const memberUserIds = await this._memberRepo.getMemberUserIds(
        event.chatId,
      );

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
