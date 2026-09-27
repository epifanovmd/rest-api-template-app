import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { EventBus } from "../../core";
import { createMockEmitter, uuid, uuid2 } from "../../test/helpers";
import { UserDeletedEvent } from "../user";
import {
  WorkspaceDeletedEvent,
  WorkspaceMemberAddedEvent,
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { WorkspaceListener } from "./workspace.listener";

const WS = "00000000-0000-0000-0000-00000000000a";
const ROOM = `workspace_${WS}`;
const USER = uuid();
const OTHER = uuid2();

describe("WorkspaceListener", () => {
  let bus: EventBus;
  let emitter: ReturnType<typeof createMockEmitter>;
  let workspaceService: { handleUserDeleted: sinon.SinonStub };

  beforeEach(() => {
    bus = new EventBus();
    emitter = createMockEmitter();
    workspaceService = { handleUserDeleted: sinon.stub().resolves() };
    new WorkspaceListener(
      bus,
      emitter as any,
      workspaceService as any,
    ).register();
  });

  it("MemberAdded — вход в комнату и уведомление комнаты", () => {
    bus.emit(new WorkspaceMemberAddedEvent(WS, USER, "editor", OTHER));

    expect(emitter.joinRoom.calledOnceWith(USER, ROOM)).to.equal(true);
    expect(
      emitter.toRoom.calledOnceWith(ROOM, "workspace:member-added", {
        workspaceId: WS,
        userId: USER,
        role: "editor",
      }),
    ).to.equal(true);
  });

  it("MemberRemoved — leaveRoom, уведомление комнаты и самого участника", () => {
    bus.emit(new WorkspaceMemberRemovedEvent(WS, USER, OTHER));

    expect(emitter.leaveRoom.calledOnceWith(USER, ROOM)).to.equal(true);
    expect(emitter.toRoom.firstCall.args[1]).to.equal(
      "workspace:member-removed",
    );
    expect(
      emitter.toUser.calledOnceWith(USER, "workspace:member-removed"),
    ).to.equal(true);
  });

  it("RoleChanged — уведомление комнаты", () => {
    bus.emit(
      new WorkspaceMemberRoleChangedEvent(WS, USER, "admin", "editor", OTHER),
    );

    expect(emitter.toRoom.firstCall.args).to.deep.equal([
      ROOM,
      "workspace:member-role-changed",
      { workspaceId: WS, userId: USER, role: "admin", previousRole: "editor" },
    ]);
  });

  it("Deleted — каждому участнику событие и выход из комнаты", () => {
    bus.emit(new WorkspaceDeletedEvent(WS, [USER, OTHER], USER));

    expect(emitter.toUser.callCount).to.equal(2);
    expect(emitter.leaveRoom.calledWith(OTHER, ROOM)).to.equal(true);
  });

  it("UserDeleted — очистка пространств", () => {
    bus.emit(new UserDeletedEvent(USER));

    expect(workspaceService.handleUserDeleted.calledOnce).to.equal(true);
  });
});
