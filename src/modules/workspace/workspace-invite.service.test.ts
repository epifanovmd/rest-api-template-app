import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { hashToken, type HttpException } from "../../core";
import {
  createMockDataSource,
  createMockEntityManager,
  createMockEventBus,
  uuid,
  uuid2,
} from "../../test/helpers";
import type { AuthContext } from "../../types/koa";
import { User } from "../user/user.entity";
import { WorkspaceMemberAddedEvent } from "./events";
import { Workspace } from "./workspace.entity";
import { WorkspaceInvite } from "./workspace-invite.entity";
import { WorkspaceInviteService } from "./workspace-invite.service";
import { WorkspaceMember } from "./workspace-member.entity";

const WS = "00000000-0000-0000-0000-00000000000a";
const ADMIN = uuid();
const INVITEE = uuid2();
const EMAIL = "bob@example.com";

const actor = (userId = ADMIN): AuthContext => ({
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

const pendingInvite = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  workspaceId: WS,
  email: EMAIL,
  role: "editor",
  tokenHash: "h",
  invitedBy: ADMIN,
  expiresAt: new Date(Date.now() + 60_000),
  acceptedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  ...overrides,
});

describe("WorkspaceInviteService", () => {
  let invites: Record<string, sinon.SinonStub>;
  let members: Record<string, sinon.SinonStub>;
  let access: { require: sinon.SinonStub; invalidate: sinon.SinonStub };
  let users: { findById: sinon.SinonStub };
  let mailer: { send: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
  let manager: ReturnType<typeof createMockEntityManager>;
  let service: WorkspaceInviteService;

  const asRole = (role: string) =>
    access.require.callsFake(async (a: AuthContext) => ({
      workspaceId: WS,
      userId: a.userId,
      role,
      viaSuperuser: false,
    }));

  beforeEach(() => {
    invites = {
      findByTokenHash: sinon.stub().resolves(null),
      findInWorkspace: sinon.stub().resolves(null),
      findPage: sinon.stub().resolves([[], 0]),
      revokePending: sinon.stub().resolves(),
      markAccepted: sinon.stub().resolves(true),
      markRevoked: sinon.stub().resolves(true),
    };
    members = { existsByEmail: sinon.stub().resolves(false) };
    access = { require: sinon.stub(), invalidate: sinon.stub().resolves() };
    users = {
      findById: sinon
        .stub()
        .resolves({ id: INVITEE, email: EMAIL, emailVerified: true }),
    };
    mailer = { send: sinon.stub().resolves() };
    eventBus = createMockEventBus();
    manager = createMockEntityManager();
    manager.repo(Workspace).findOne.resolves({ id: WS, name: "Team" });
    manager.repo(WorkspaceInvite).save.callsFake(async (i: object) => ({
      id: "inv-1",
      createdAt: new Date(),
      ...i,
    }));
    service = new WorkspaceInviteService(
      invites as any,
      members as any,
      access as any,
      users as any,
      mailer as any,
      eventBus as any,
      createMockDataSource(manager) as any,
    );
    asRole("admin");
  });

  describe("create", () => {
    it("хранит хеш токена, письмо — в той же транзакции, токен не возвращается", async () => {
      const dto = await service.create(actor(), WS, {
        email: " Bob@Example.com ",
        role: "editor",
      });

      const saved = manager.repo(WorkspaceInvite).save.firstCall.args[0];
      const [to, data, txManager] = mailer.send.firstCall.args;
      const token = new URL(data.inviteLink).searchParams.get("token")!;

      expect(saved.email).to.equal(EMAIL);
      expect(saved.tokenHash).to.equal(hashToken(token));
      expect(to).to.equal(EMAIL);
      expect(data.workspaceName).to.equal("Team");
      expect(txManager).to.equal(manager);
      expect(invites.revokePending.calledOnceWith(WS, EMAIL, manager)).to.equal(
        true,
      );
      expect(JSON.stringify(dto)).not.to.include(token);
      expect(dto).not.to.have.property("tokenHash");
      expect(dto.status).to.equal("pending");
    });

    it("требует admin", async () => {
      await service.create(actor(), WS, { email: EMAIL, role: "viewer" });

      expect(access.require.firstCall.args[2]).to.equal("admin");
    });

    it("роль выше своей — WORKSPACE_ROLE_TOO_HIGH", async () => {
      asRole("editor");

      await expectCode(
        service.create(actor(), WS, { email: EMAIL, role: "admin" }),
        "WORKSPACE_ROLE_TOO_HIGH",
      );
      expect(mailer.send.called).to.equal(false);
    });

    it("уже участник — WORKSPACE_ALREADY_MEMBER", async () => {
      members.existsByEmail.resolves(true);

      await expectCode(
        service.create(actor(), WS, { email: EMAIL, role: "viewer" }),
        "WORKSPACE_ALREADY_MEMBER",
      );
    });

    it("сбой постановки письма — ошибка из транзакции (приглашение откатывается)", async () => {
      mailer.send.rejects(new Error("queue down"));

      try {
        await service.create(actor(), WS, { email: EMAIL, role: "viewer" });
        expect.fail("ожидалась ошибка");
      } catch (err) {
        expect((err as Error).message).to.equal("queue down");
      }
    });
  });

  describe("revoke", () => {
    it("действующее — отзывается", async () => {
      invites.findInWorkspace.resolves(pendingInvite());

      await service.revoke(actor(), WS, "inv-1");

      expect(invites.markRevoked.calledOnce).to.equal(true);
    });

    it("принятое — WORKSPACE_INVITE_ALREADY_USED", async () => {
      invites.findInWorkspace.resolves(
        pendingInvite({ acceptedAt: new Date() }),
      );

      await expectCode(
        service.revoke(actor(), WS, "inv-1"),
        "WORKSPACE_INVITE_ALREADY_USED",
      );
    });

    it("чужое или нет — WORKSPACE_INVITE_NOT_FOUND", async () => {
      await expectCode(
        service.revoke(actor(), WS, "inv-x"),
        "WORKSPACE_INVITE_NOT_FOUND",
      );
    });
  });

  describe("accept", () => {
    beforeEach(() => {
      invites.findByTokenHash.resolves(pendingInvite());
    });

    it("ищет по хешу, добавляет участника с ролью приглашения", async () => {
      const dto = await service.accept(actor(INVITEE), "tok");

      expect(invites.findByTokenHash.calledOnceWith(hashToken("tok"))).to.equal(
        true,
      );
      expect(manager.repo(WorkspaceMember).save.firstCall.args[0]).to.include({
        workspaceId: WS,
        userId: INVITEE,
        role: "editor",
      });
      expect(dto.role).to.equal("editor");
      expect(access.invalidate.calledOnceWith(WS, [INVITEE])).to.equal(true);

      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(WorkspaceMemberAddedEvent);
      expect(event).to.include({
        userId: INVITEE,
        role: "editor",
        actorId: ADMIN,
      });
    });

    it("email не совпал — WORKSPACE_INVITE_EMAIL_MISMATCH", async () => {
      users.findById.resolves({
        id: INVITEE,
        email: "eve@example.com",
        emailVerified: true,
      });

      await expectCode(
        service.accept(actor(INVITEE), "tok"),
        "WORKSPACE_INVITE_EMAIL_MISMATCH",
      );
    });

    it("email совпал, но не подтверждён — ссылка из письма его подтверждает", async () => {
      users.findById.resolves({
        id: INVITEE,
        email: EMAIL,
        emailVerified: false,
      });

      const dto = await service.accept(actor(INVITEE), "tok");

      expect(dto.role).to.equal("editor");
      expect(
        manager
          .repo(User)
          .update.calledOnceWith(INVITEE, { emailVerified: true }),
      ).to.equal(true);
    });

    it("подтверждённый email не перезаписывается", async () => {
      await service.accept(actor(INVITEE), "tok");

      expect(manager.repo(User).update.called).to.equal(false);
    });

    it("email без учёта регистра", async () => {
      users.findById.resolves({
        id: INVITEE,
        email: "BOB@example.com",
        emailVerified: true,
      });

      await service.accept(actor(INVITEE), "tok");
    });

    it("неизвестный или отозванный токен — WORKSPACE_INVITE_NOT_FOUND", async () => {
      invites.findByTokenHash.resolves(
        pendingInvite({ revokedAt: new Date() }),
      );

      await expectCode(
        service.accept(actor(INVITEE), "tok"),
        "WORKSPACE_INVITE_NOT_FOUND",
      );
    });

    it("истёкший — WORKSPACE_INVITE_EXPIRED", async () => {
      invites.findByTokenHash.resolves(
        pendingInvite({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expectCode(
        service.accept(actor(INVITEE), "tok"),
        "WORKSPACE_INVITE_EXPIRED",
      );
    });

    it("принят параллельно — WORKSPACE_INVITE_ALREADY_USED, участник не создаётся", async () => {
      invites.markAccepted.resolves(false);

      await expectCode(
        service.accept(actor(INVITEE), "tok"),
        "WORKSPACE_INVITE_ALREADY_USED",
      );
      expect(manager.repo(WorkspaceMember).save.called).to.equal(false);
    });

    it("уже участник — роль сохраняется, события нет", async () => {
      manager.repo(WorkspaceMember).findOne.resolves({ role: "admin" });

      const dto = await service.accept(actor(INVITEE), "tok");

      expect(dto.role).to.equal("admin");
      expect(manager.repo(WorkspaceMember).save.called).to.equal(false);
      expect(eventBus.emit.called).to.equal(false);
    });
  });
});
