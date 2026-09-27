import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import type { HttpException } from "../../core";
import { createMockEventBus, uuid, uuid2, uuid3 } from "../../test/helpers";
import type { AuthContext } from "../../types/koa";
import {
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { WorkspaceMemberService } from "./workspace-member.service";

const WS = "00000000-0000-0000-0000-00000000000a";
const ME = uuid();
const TARGET = uuid2();
const OTHER = uuid3();

const actor = (userId = ME): AuthContext => ({
  userId,
  sessionId: "s",
  roles: ["user"],
  permissions: [],
  emailVerified: true,
});

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
  } catch (err) {
    expect((err as HttpException).code).to.equal(code);

    return;
  }
  expect.fail(`ожидалась ошибка ${code}`);
};

describe("WorkspaceMemberService", () => {
  let members: Record<string, sinon.SinonStub>;
  let access: { require: sinon.SinonStub; invalidate: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: WorkspaceMemberService;

  /** Моя роль в пространстве. */
  const asRole = (role: string) =>
    access.require.callsFake(async (a: AuthContext | string) => ({
      workspaceId: WS,
      userId: typeof a === "string" ? a : a.userId,
      role,
      viaSuperuser: false,
    }));

  const target = (role: string) =>
    members.findMembership.resolves({
      id: "m-t",
      workspaceId: WS,
      userId: TARGET,
      role,
      createdAt: new Date(),
      user: null,
    });

  beforeEach(() => {
    members = {
      findMembership: sinon.stub().resolves(null),
      findPage: sinon.stub().resolves([[], 0]),
      update: sinon.stub().resolves({ affected: 1 }),
      delete: sinon.stub().resolves({ affected: 1 }),
    };
    access = { require: sinon.stub(), invalidate: sinon.stub().resolves() };
    eventBus = createMockEventBus();
    service = new WorkspaceMemberService(
      members as any,
      access as any,
      eventBus as any,
    );
    asRole("admin");
  });

  describe("list", () => {
    it("viewer видит участников; ответ — страница", async () => {
      asRole("viewer");
      members.findPage.resolves([
        [
          {
            workspaceId: WS,
            userId: TARGET,
            role: "editor",
            createdAt: new Date(),
            user: {
              username: "bob",
              profile: { firstName: "Bob", lastName: null },
            },
          },
        ],
        7,
      ]);

      const page = await service.list(actor(), WS, { offset: 0, limit: 1 });

      expect(access.require.firstCall.args[2]).to.equal("viewer");
      expect(page.total).to.equal(7);
      expect(page.items[0]).to.include({
        username: "bob",
        firstName: "Bob",
        role: "editor",
      });
    });
  });

  describe("changeRole", () => {
    it("admin повышает editor до admin; событие и сброс кэша", async () => {
      target("editor");

      const dto = await service.changeRole(actor(), WS, TARGET, "admin");

      expect(dto.role).to.equal("admin");
      expect(
        members.update.calledOnceWith({ id: "m-t" }, { role: "admin" }),
      ).to.equal(true);
      expect(access.invalidate.calledOnceWith(WS, [TARGET])).to.equal(true);

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(WorkspaceMemberRoleChangedEvent);
      expect(event).to.include({
        role: "admin",
        previousRole: "editor",
        actorId: ME,
      });
    });

    it("editor не может менять роли — требуется admin", async () => {
      access.require.rejects(new Error("forbidden"));
      target("viewer");

      try {
        await service.changeRole(actor(), WS, TARGET, "editor");
        expect.fail("ожидалась ошибка");
      } catch {
        expect(members.update.called).to.equal(false);
      }
      expect(access.require.firstCall.args[2]).to.equal("admin");
    });

    it("owner назначается только передачей", async () => {
      target("editor");

      await expectCode(
        service.changeRole(actor(), WS, TARGET, "owner"),
        "WORKSPACE_OWNER_ROLE_VIA_TRANSFER",
      );
    });

    it("владельца менять нельзя", async () => {
      asRole("owner");
      target("owner");

      await expectCode(
        service.changeRole(actor(), WS, TARGET, "admin"),
        "WORKSPACE_CANNOT_MANAGE_MEMBER",
      );
    });

    it("нет участника — WORKSPACE_MEMBER_NOT_FOUND", async () => {
      await expectCode(
        service.changeRole(actor(), WS, TARGET, "viewer"),
        "WORKSPACE_MEMBER_NOT_FOUND",
      );
    });

    it("та же роль — без записи и события", async () => {
      target("editor");

      await service.changeRole(actor(), WS, TARGET, "editor");

      expect(members.update.called).to.equal(false);
      expect(eventBus.emit.called).to.equal(false);
    });
  });

  describe("remove", () => {
    it("admin удаляет editor: leaveRoom-событие и сброс кэша", async () => {
      target("editor");

      await service.remove(actor(), WS, TARGET);

      expect(
        members.delete.calledOnceWith({ workspaceId: WS, userId: TARGET }),
      ).to.equal(true);
      expect(access.invalidate.calledOnceWith(WS, [TARGET])).to.equal(true);

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(WorkspaceMemberRemovedEvent);
      expect(event).to.include({ userId: TARGET, actorId: ME });
    });

    it("владельца удалить нельзя", async () => {
      target("owner");

      await expectCode(
        service.remove(actor(), WS, TARGET),
        "WORKSPACE_CANNOT_MANAGE_MEMBER",
      );
      expect(members.delete.called).to.equal(false);
    });

    it("себя — это выход", async () => {
      asRole("editor");

      await service.remove(actor(), WS, ME);

      expect(access.require.firstCall.args).to.deep.equal([ME, WS, "viewer"]);
      expect(
        members.delete.calledOnceWith({ workspaceId: WS, userId: ME }),
      ).to.equal(true);
    });
  });

  describe("leave", () => {
    it("участник выходит; событие с actorId = userId", async () => {
      asRole("viewer");

      await service.leave(OTHER, WS);

      expect(eventBus.emit.firstCall.args[0]).to.include({
        userId: OTHER,
        actorId: OTHER,
      });
    });

    it("владелец не может выйти", async () => {
      asRole("owner");

      await expectCode(service.leave(ME, WS), "WORKSPACE_OWNER_CANNOT_LEAVE");
      expect(members.delete.called).to.equal(false);
    });

    it("уже удалён параллельно — без события", async () => {
      asRole("viewer");
      members.delete.resolves({ affected: 0 });

      await service.leave(ME, WS);

      expect(eventBus.emit.called).to.equal(false);
    });
  });
});
