import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { SocketService } from "../socket";
import {
  DialogCreatedEvent,
  DialogDeletedEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageUpdatedEvent,
} from "./events";

@Injectable()
export class DialogSocketEventHandler {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketService) private readonly socketService: SocketService,
  ) {}

  register(): void {
    this.eventBus.on(MessageCreatedEvent, e => this.onMessageCreated(e));
    this.eventBus.on(MessageUpdatedEvent, e => this.onMessageUpdated(e));
    this.eventBus.on(MessageDeletedEvent, e => this.onMessageDeleted(e));
    this.eventBus.on(DialogCreatedEvent, e => this.onDialogCreated(e));
    this.eventBus.on(DialogDeletedEvent, e => this.onDialogDeleted(e));
    this.eventBus.on(MemberAddedEvent, e => this.onMemberAdded(e));
    this.eventBus.on(MemberRemovedEvent, e => this.onMemberRemoved(e));
  }

  private onMessageCreated({ message, recipientIds }: MessageCreatedEvent): void {
    recipientIds.forEach(id => this.socketService.notifyUser(id, "message", message));
  }

  private onMessageUpdated({ message, memberIds }: MessageUpdatedEvent): void {
    memberIds.forEach(id => this.socketService.notifyUser(id, "message", message));
  }

  private onMessageDeleted({
    dialogId,
    messageId,
    memberIds,
  }: MessageDeletedEvent): void {
    memberIds.forEach(id =>
      this.socketService.notifyUser(id, "deleteMessage", dialogId, messageId),
    );
  }

  private onDialogCreated({ dialogId, memberIds }: DialogCreatedEvent): void {
    memberIds.forEach(id => this.socketService.notifyUser(id, "newDialog", dialogId));
  }

  private onDialogDeleted({ dialogId, memberIds }: DialogDeletedEvent): void {
    memberIds.forEach(id =>
      this.socketService.notifyUser(id, "deleteDialog", dialogId),
    );
  }

  private onMemberAdded({ dialogId, memberIds }: MemberAddedEvent): void {
    memberIds.forEach(id => this.socketService.notifyUser(id, "newDialog", dialogId));
  }

  private onMemberRemoved({ dialogId, memberId }: MemberRemovedEvent): void {
    this.socketService.notifyUser(memberId, "deleteDialog", dialogId);
  }
}
