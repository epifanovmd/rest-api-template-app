import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { FileUrlService } from "../file";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { Call } from "./call.entity";
import { CallDto, collectCallFiles } from "./dto";
import {
  CallAnsweredEvent,
  CallDeclinedEvent,
  CallEndedEvent,
  CallInitiatedEvent,
  CallMissedEvent,
} from "./events";

type TCallEvent =
  | typeof CallInitiatedEvent
  | typeof CallAnsweredEvent
  | typeof CallDeclinedEvent
  | typeof CallEndedEvent
  | typeof CallMissedEvent;

@Injectable()
export class CallListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(FileUrlService) private readonly _fileUrls: FileUrlService,
  ) {}

  register(): void {
    this._on(CallInitiatedEvent, (call, dto) => {
      this._emitter.toUser(call.calleeId, "call:incoming", dto);
    });

    this._on(CallAnsweredEvent, (call, dto) => {
      this._emitter.toUser(call.callerId, "call:answered", dto);
    });

    this._on(CallDeclinedEvent, (call, dto) => {
      this._emitter.toUser(call.callerId, "call:declined", dto);
      this._emitter.toUser(call.calleeId, "call:declined", dto);
    });

    this._on(CallEndedEvent, (call, dto) => {
      this._emitter.toUser(call.callerId, "call:ended", dto);
      this._emitter.toUser(call.calleeId, "call:ended", dto);
    });

    // Обе стороны: отмена caller'ом, таймаут или отказ с другого устройства
    this._on(CallMissedEvent, (call, dto) => {
      this._emitter.toUser(call.callerId, "call:missed", dto);
      this._emitter.toUser(call.calleeId, "call:missed", dto);
    });
  }

  /** Подписка с DTO звонка, у которого подписаны ссылки на аватары. */
  private _on(
    EventClass: TCallEvent,
    send: (call: Call, dto: CallDto) => void,
  ) {
    this._eventBus.on(EventClass, async ({ call }: { call: Call }) => {
      send(
        call,
        await this._fileUrls.buildOneWithFiles(
          call,
          collectCallFiles,
          CallDto.fromEntity,
        ),
      );
    });
  }
}
