import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { type ISocketEventListener, SocketEmitterService } from "../socket";
import { UserDeletedEvent } from "../user";
import {
  WorkspaceDeletedEvent,
  WorkspaceMemberAddedEvent,
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { WorkspaceService } from "./workspace.service";
import { workspaceRoom } from "./workspace.types";

/** События пространств → комнаты сокета; удаление пользователя → очистка. */
@Injectable()
export class WorkspaceListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(WorkspaceService)
    private readonly _workspaceService: WorkspaceService,
  ) {}

  register(): void {
    this._eventBus.on(WorkspaceMemberAddedEvent, event => {
      const room = workspaceRoom(event.workspaceId);

      this._emitter.joinRoom(event.userId, room);
      this._emitter.toRoom(room, "workspace:member-added", {
        workspaceId: event.workspaceId,
        userId: event.userId,
        role: event.role,
      });
    });

    this._eventBus.on(WorkspaceMemberRemovedEvent, event => {
      const room = workspaceRoom(event.workspaceId);
      const payload = {
        workspaceId: event.workspaceId,
        userId: event.userId,
      };

      this._emitter.leaveRoom(event.userId, room);
      this._emitter.toRoom(room, "workspace:member-removed", payload);
      this._emitter.toUser(event.userId, "workspace:member-removed", payload);
    });

    this._eventBus.on(WorkspaceMemberRoleChangedEvent, event => {
      this._emitter.toRoom(
        workspaceRoom(event.workspaceId),
        "workspace:member-role-changed",
        {
          workspaceId: event.workspaceId,
          userId: event.userId,
          role: event.role,
          previousRole: event.previousRole,
        },
      );
    });

    this._eventBus.on(WorkspaceDeletedEvent, event => {
      const room = workspaceRoom(event.workspaceId);

      for (const userId of event.memberUserIds) {
        this._emitter.toUser(userId, "workspace:deleted", {
          workspaceId: event.workspaceId,
        });
        this._emitter.leaveRoom(userId, room);
      }
    });

    this._eventBus.on(UserDeletedEvent, () =>
      this._workspaceService.handleUserDeleted(),
    );
  }
}
