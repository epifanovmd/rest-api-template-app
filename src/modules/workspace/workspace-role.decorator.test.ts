import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import type { HttpException } from "../../core";
import { WorkspaceError } from "./workspace.errors";
import {
  createWorkspaceRoleMiddleware,
  getWorkspaceMember,
} from "./workspace-role.decorator";

const WS = "00000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-000000000001";
const user = {
  userId: USER,
  sessionId: "s",
  roles: [],
  permissions: [],
  emailVerified: true,
};

const makeCtx = (params: Record<string, string>, withUser = true) =>
  ({
    params,
    state: {} as Record<string, unknown>,
    request: withUser ? { user } : {},
  }) as any;

describe("WorkspaceRole middleware", () => {
  it("проверяет роль по параметру пути и кладёт членство в state", async () => {
    const membership = {
      workspaceId: WS,
      userId: USER,
      role: "editor",
      viaSuperuser: false,
    };
    const access = { require: sinon.stub().resolves(membership) };
    const next = sinon.stub().resolves();
    const ctx = makeCtx({ projectId: WS });

    await createWorkspaceRoleMiddleware(
      "editor",
      { param: "projectId" },
      () => access as any,
    )(ctx, next);

    expect(access.require.calledOnceWith(user, WS, "editor")).to.equal(true);
    expect(ctx.state.workspaceMember).to.equal(membership);
    expect(next.calledOnce).to.equal(true);
  });

  it("по умолчанию берёт параметр workspaceId", async () => {
    const access = { require: sinon.stub().resolves({}) };

    await createWorkspaceRoleMiddleware(
      "viewer",
      {},
      () => access as any,
    )(makeCtx({ workspaceId: WS }), sinon.stub().resolves());

    expect(access.require.firstCall.args[1]).to.equal(WS);
  });

  it("отказ доступа — ошибка, next не вызывается", async () => {
    const access = {
      require: sinon.stub().rejects(WorkspaceError.FORBIDDEN()),
    };
    const next = sinon.stub();

    try {
      await createWorkspaceRoleMiddleware(
        "admin",
        {},
        () => access as any,
      )(makeCtx({ workspaceId: WS }), next);
      expect.fail("ожидалась ошибка");
    } catch (err) {
      expect((err as HttpException).code).to.equal("WORKSPACE_FORBIDDEN");
    }
    expect(next.called).to.equal(false);
  });

  it("нет параметра — WORKSPACE_NOT_FOUND", async () => {
    const access = { require: sinon.stub() };

    try {
      await createWorkspaceRoleMiddleware(
        "viewer",
        {},
        () => access as any,
      )(makeCtx({}), sinon.stub());
      expect.fail("ожидалась ошибка");
    } catch (err) {
      expect((err as HttpException).code).to.equal("WORKSPACE_NOT_FOUND");
    }
    expect(access.require.called).to.equal(false);
  });

  it("без аутентификации — 401", async () => {
    try {
      await createWorkspaceRoleMiddleware(
        "viewer",
        {},
        () => ({}) as any,
      )(makeCtx({ workspaceId: WS }, false), sinon.stub());
      expect.fail("ожидалась ошибка");
    } catch (err) {
      expect((err as HttpException).status).to.equal(401);
    }
  });

  describe("getWorkspaceMember", () => {
    it("возвращает членство из state", () => {
      const member = { workspaceId: WS };

      expect(
        getWorkspaceMember({
          ctx: { state: { workspaceMember: member } },
        } as any),
      ).to.equal(member);
    });

    it("маршрут без декоратора — 500", () => {
      expect(() => getWorkspaceMember({ ctx: { state: {} } } as any))
        .to.throw()
        .with.property("status", 500);
    });
  });
});
