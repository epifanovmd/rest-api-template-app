import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketServerService } from "../socket";
import {
  DialogCreatedEvent,
  DialogDeletedEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
} from "./events";

/**
 * Реактивно управляет socket-rooms диалогов через EventBus.
 *
 * Использует Socket.IO socketsJoin/socketsLeave — это работает для всех
 * активных соединений пользователя (несколько вкладок/устройств) через
 * их личную room 'user_${userId}'.
 */
@Injectable()
export class DialogRoomManager implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketServerService)
    private readonly serverService: SocketServerService,
  ) {}

  register(): void {
    this.eventBus.on(DialogCreatedEvent, e => this.onDialogCreated(e));
    this.eventBus.on(DialogDeletedEvent, e => this.onDialogDeleted(e));
    this.eventBus.on(MemberAddedEvent, e => this.onMemberAdded(e));
    this.eventBus.on(MemberRemovedEvent, e => this.onMemberRemoved(e));
  }

  private onDialogCreated({ dialogId, memberIds }: DialogCreatedEvent): void {
    memberIds.forEach(userId =>
      this.serverService.io
        .in(`user_${userId}`)
        .socketsJoin(`dialog_${dialogId}`),
    );
  }

  private onDialogDeleted({ dialogId, memberIds }: DialogDeletedEvent): void {
    memberIds.forEach(userId =>
      this.serverService.io
        .in(`user_${userId}`)
        .socketsLeave(`dialog_${dialogId}`),
    );
  }

  private onMemberAdded({ dialogId, memberIds }: MemberAddedEvent): void {
    memberIds.forEach(userId =>
      this.serverService.io
        .in(`user_${userId}`)
        .socketsJoin(`dialog_${dialogId}`),
    );
  }

  private onMemberRemoved({ dialogId, memberId }: MemberRemovedEvent): void {
    this.serverService.io
      .in(`user_${memberId}`)
      .socketsLeave(`dialog_${dialogId}`);
  }
}
