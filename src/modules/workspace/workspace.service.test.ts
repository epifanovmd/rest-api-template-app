import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";
import { QueryFailedError } from "typeorm";

import { type HttpException, logger } from "../../core";
import {
  createMockDataSource,
  createMockEntityManager,
  createMockEventBus,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import type { AuthContext } from "../../types/koa";
import {
  WorkspaceDeletedEvent,
  WorkspaceMemberAddedEvent,
  WorkspaceMemberRoleChangedEvent,
} from "./events";
import { Workspace } from "./workspace.entity";
import { generateSlug, WorkspaceService } from "./workspace.service";
import { WorkspaceMember } from "./workspace-member.entity";

const WS = "00000000-0000-0000-0000-00000000000a";
const OWNER = uuid();
const ADMIN = uuid2();
const EDITOR = uuid3();

const actor = (userId = OWNER): AuthContext => ({
  userId,
  sessionId: "s",
  roles: ["user"],
  permissions: [],
  emailVerified: true,
});

const uniqueViolation = () =>
  new QueryFailedError(
    "INSERT",
    [],
    Object.assign(new Error("dup"), { code: "23505" }),
  );

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
  } catch (err) {
    expect((err as HttpException).code).to.equal(code);

    return;
  }
  expect.fail(`ожидалась ошибка ${code}`);
};

const createAccess = (role = "owner", viaSuperuser = false) => ({
  require: sinon
    .stub()
    .callsFake(async (a: AuthContext | string, workspaceId: string) => ({
      workspaceId,
      userId: typeof a === "string" ? a : a.userId,
      role,
      viaSuperuser,
    })),
  invalidate: sinon.stub().resolves(),
});

describe("WorkspaceService", () => {
  let workspaces: Record<string, sinon.SinonStub>;
  let members: Record<string, sinon.SinonStub>;
  let access: ReturnType<typeof createAccess>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let manager: ReturnType<typeof createMockEntityManager>;
  let dataSource: ReturnType<typeof createMockDataSource>;

  const build = () =>
    new WorkspaceService(
      workspaces as any,
      members as any,
      access as any,
      eventBus as any,
      dataSource as any,
    );

  beforeEach(() => {
    workspaces = {
      findById: sinon.stub().resolves(null),
      save: sinon.stub().callsFake(async (w: unknown) => w),
      delete: sinon.stub().resolves({ affected: 1 }),
      findOrphanIds: sinon.stub().resolves([]),
      findWithoutOwnerIds: sinon.stub().resolves([]),
    };
    members = {
      findUserIds: sinon.stub().resolves([OWNER, ADMIN]),
      findPageByUser: sinon.stub().resolves([[], 0]),
      findOwnershipCandidate: sinon.stub().resolves(null),
    };
    access = createAccess();
    eventBus = createMockEventBus();
    manager = createMockEntityManager();
    dataSource = createMockDataSource(manager);
  });

  afterEach(() => sinon.restore());

  describe("generateSlug", () => {
    it("латиница из названия плюс случайный хвост", () => {
      expect(generateSlug("My Team!")).to.match(/^my-team-[0-9a-f]{6}$/);
    });

    it("название без латиницы — workspace-<хвост>", () => {
      expect(generateSlug("Команда")).to.match(/^workspace-[0-9a-f]{6}$/);
    });
  });

  describe("create", () => {
    it("создатель становится owner, событие MemberAdded", async () => {
      manager.repo(Workspace).save.callsFake(async (w: object) => ({
        id: WS,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        ...w,
      }));

      const dto = await build().create(OWNER, {
        name: "Team",
        slug: "team",
        description: "Разметка контейнеров",
      });

      expect(dto.role).to.equal("owner");
      expect(dto.description).to.equal("Разметка контейнеров");
      expect(dto.ownerId).to.equal(OWNER);
      expect(
        manager.repo(WorkspaceMember).save.firstCall.args[0],
      ).to.deep.equal({
        workspaceId: WS,
        userId: OWNER,
        role: "owner",
      });

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(WorkspaceMemberAddedEvent);
      expect(event.role).to.equal("owner");
    });

    it("занятый slug — WORKSPACE_SLUG_TAKEN без повторов", async () => {
      manager.repo(Workspace).save.rejects(uniqueViolation());

      await expectCode(
        build().create(OWNER, { name: "Team", slug: "team" }),
        "WORKSPACE_SLUG_TAKEN",
      );
      expect(dataSource.transaction.calledOnce).to.equal(true);
    });

    it("сгенерированный slug при коллизии подбирается заново", async () => {
      manager
        .repo(Workspace)
        .save.onFirstCall()
        .rejects(uniqueViolation())
        .onSecondCall()
        .callsFake(async (w: object) => ({ id: WS, ...w }));

      await build().create(OWNER, { name: "Team" });

      expect(dataSource.transaction.calledTwice).to.equal(true);
    });
  });

  describe("delete", () => {
    it("только owner; удаляет, сбрасывает кэш, событие со составом", async () => {
      await build().delete(actor(), WS);

      expect(access.require.firstCall.args[2]).to.equal("owner");
      expect(workspaces.delete.calledOnceWith({ id: WS })).to.equal(true);
      expect(access.invalidate.calledOnceWith(WS, [OWNER, ADMIN])).to.equal(
        true,
      );

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(WorkspaceDeletedEvent);
      expect(event.memberUserIds).to.deep.equal([OWNER, ADMIN]);
      expect(event.actorId).to.equal(OWNER);
    });

    it("не owner — ошибка доступа, ничего не удаляется", async () => {
      access.require.rejects(new Error("forbidden"));

      try {
        await build().delete(actor(ADMIN), WS);
        expect.fail("ожидалась ошибка");
      } catch {
        expect(workspaces.delete.called).to.equal(false);
      }
    });
  });

  describe("update", () => {
    it("архивирование — admin и выше, archivedAt выставляется", async () => {
      access = createAccess("admin");
      workspaces.findById.resolves({
        id: WS,
        name: "A",
        slug: "a",
        archivedAt: null,
      });

      const dto = await build().update(actor(ADMIN), WS, { archived: true });

      expect(access.require.firstCall.args[2]).to.equal("admin");
      expect(dto.archivedAt).to.be.instanceOf(Date);
    });

    it("описание: задаётся и очищается пустой строкой", async () => {
      workspaces.findById.resolves({
        id: WS,
        name: "A",
        slug: "a",
        description: "старое",
        archivedAt: null,
      });

      const cleared = await build().update(actor(), WS, { description: "" });

      expect(cleared.description).to.equal(null);

      const set = await build().update(actor(), WS, { description: "новое" });

      expect(set.description).to.equal("новое");
    });

    it("занятый slug — WORKSPACE_SLUG_TAKEN", async () => {
      workspaces.findById.resolves({
        id: WS,
        name: "A",
        slug: "a",
        archivedAt: null,
      });
      workspaces.save.rejects(uniqueViolation());

      await expectCode(
        build().update(actor(), WS, { slug: "taken" }),
        "WORKSPACE_SLUG_TAKEN",
      );
    });
  });

  describe("transferOwnership", () => {
    beforeEach(() => {
      manager.repo(Workspace).findOne.resolves({ id: WS, ownerId: OWNER });
    });

    it("целевой → owner, прежний владелец → admin", async () => {
      const memberRepo = manager.repo(WorkspaceMember);

      memberRepo.findOne.resolves({
        id: "m-2",
        userId: EDITOR,
        role: "editor",
      });
      memberRepo.find.resolves([{ userId: OWNER, role: "owner" }]);

      const dto = await build().transferOwnership(actor(), WS, EDITOR);

      expect(
        manager.repo(Workspace).findOne.firstCall.args[0].lock,
      ).to.deep.equal({
        mode: "pessimistic_write",
      });
      expect(memberRepo.update.firstCall.args[1]).to.deep.equal({
        role: "admin",
      });
      expect(memberRepo.update.secondCall.args).to.deep.equal([
        { id: "m-2" },
        { role: "owner" },
      ]);
      expect(manager.repo(Workspace).save.firstCall.args[0].ownerId).to.equal(
        EDITOR,
      );
      expect(dto.role).to.equal("admin");
      expect(access.invalidate.calledOnceWith(WS, [OWNER, EDITOR])).to.equal(
        true,
      );

      const events = eventBus.emit.getCalls().map(c => c.args[0]);

      expect(events).to.have.length(2);
      expect(
        events.every(e => e instanceof WorkspaceMemberRoleChangedEvent),
      ).to.equal(true);
      expect(events[1]).to.include({
        userId: EDITOR,
        role: "owner",
        previousRole: "editor",
      });
    });

    it("не участник — WORKSPACE_MEMBER_NOT_FOUND", async () => {
      await expectCode(
        build().transferOwnership(actor(), WS, EDITOR),
        "WORKSPACE_MEMBER_NOT_FOUND",
      );
      expect(eventBus.emit.called).to.equal(false);
    });

    it("себе — WORKSPACE_TRANSFER_TO_SELF", async () => {
      manager
        .repo(WorkspaceMember)
        .findOne.resolves({ id: "m-1", userId: OWNER, role: "owner" });

      await expectCode(
        build().transferOwnership(actor(), WS, OWNER),
        "WORKSPACE_TRANSFER_TO_SELF",
      );
    });
  });

  describe("handleUserDeleted", () => {
    it("пространства без участников удаляются", async () => {
      workspaces.findOrphanIds.resolves([WS]);
      members.findUserIds.resolves([]);

      await build().handleUserDeleted();

      expect(workspaces.delete.calledOnceWith({ id: WS })).to.equal(true);
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        WorkspaceDeletedEvent,
      );
    });

    it("без владельца — владение переходит кандидату (старейший admin)", async () => {
      workspaces.findWithoutOwnerIds.resolves([WS]);
      members.findOwnershipCandidate.resolves({
        id: "m-2",
        userId: ADMIN,
        role: "admin",
      });
      manager.repo(Workspace).findOne.resolves({ id: WS, ownerId: null });

      await build().handleUserDeleted();

      expect(manager.repo(WorkspaceMember).update.firstCall.args).to.deep.equal(
        [{ id: "m-2" }, { role: "owner" }],
      );
      expect(manager.repo(Workspace).save.firstCall.args[0].ownerId).to.equal(
        ADMIN,
      );
      expect(access.invalidate.calledOnceWith(WS, [ADMIN])).to.equal(true);
      expect(eventBus.emit.firstCall.args[0]).to.include({
        userId: ADMIN,
        role: "owner",
        previousRole: "admin",
        actorId: null,
      });
    });

    it("сбой одного пространства не мешает остальным", async () => {
      const error = sinon.stub(logger, "error");
      const other = "00000000-0000-0000-0000-00000000000b";

      workspaces.findOrphanIds.resolves([WS, other]);
      members.findUserIds.resolves([]);
      workspaces.delete.onFirstCall().rejects(new Error("db"));

      await build().handleUserDeleted();

      expect(workspaces.delete.calledTwice).to.equal(true);
      expect(error.calledOnce).to.equal(true);
    });
  });
});
