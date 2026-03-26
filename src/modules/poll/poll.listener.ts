import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { PollDto } from "./dto";
import { PollClosedEvent, PollVotedEvent } from "./events";

@Injectable()
export class PollListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  register(): void {
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
