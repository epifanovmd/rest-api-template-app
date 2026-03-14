import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketClientRegistry } from "../socket";
import {
  DialogCreatedEvent,
  DialogDeletedEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
} from "./events";

/**
 * Реактивно управляет socket-rooms диалогов через EventBus.
 * Если пользователь онлайн в момент создания диалога или изменения состава —
 * он мгновенно вступает/покидает соответствующую room без переподключения.
 */
@Injectable()
export class DialogRoomManager implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketClientRegistry)
    private readonly registry: SocketClientRegistry,
  ) {}

  register(): void {
    this.eventBus.on(DialogCreatedEvent, e => this.onDialogCreated(e));
    this.eventBus.on(DialogDeletedEvent, e => this.onDialogDeleted(e));
    this.eventBus.on(MemberAddedEvent, e => this.onMemberAdded(e));
    this.eventBus.on(MemberRemovedEvent, e => this.onMemberRemoved(e));
  }

  private onDialogCreated({ dialogId, memberIds }: DialogCreatedEvent): void {
    memberIds.forEach(userId =>
      this.registry.getSocket(userId)?.join(`dialog_${dialogId}`),
    );
  }

  private onDialogDeleted({ dialogId, memberIds }: DialogDeletedEvent): void {
    memberIds.forEach(userId =>
      this.registry.getSocket(userId)?.leave(`dialog_${dialogId}`),
    );
  }

  private onMemberAdded({ dialogId, memberIds }: MemberAddedEvent): void {
    memberIds.forEach(userId =>
      this.registry.getSocket(userId)?.join(`dialog_${dialogId}`),
    );
  }

  private onMemberRemoved({ dialogId, memberId }: MemberRemovedEvent): void {
    this.registry.getSocket(memberId)?.leave(`dialog_${dialogId}`);
  }
}
