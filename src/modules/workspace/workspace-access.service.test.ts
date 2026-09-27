import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import type { HttpException } from "../../core";
import type { AuthContext } from "../../types/koa";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspaceRoleCache } from "./workspace-role.cache";

const WS = "00000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-000000000001";

const ctx = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  userId: USER,
  sessionId: "s",
  roles: ["user"],
  permissions: [],
  emailVerified: true,
  ...overrides,
});

const expectHttpError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
  } catch (err) {
    expect((err as HttpException).code).to.equal(code);

    return err as HttpException;
  }
  expect.fail(`ожидалась ошибка ${code}`);
};

describe("WorkspaceAccessService", () => {
  let members: { findMembership: sinon.SinonStub };
  let workspaces: { existsById: sinon.SinonStub };
  let cache: WorkspaceRoleCache;
  let service: WorkspaceAccessService;

  beforeEach(() => {
    members = { findMembership: sinon.stub().resolves(null) };
    workspaces = { existsById: sinon.stub().resolves(true) };
    cache = new WorkspaceRoleCache(() => undefined);
    service = new WorkspaceAccessService(
      members as any,
      workspaces as any,
      cache,
    );
  });

  describe("roleOf", () => {
    it("роль из членства", async () => {
      members.findMembership.resolves({ role: "editor" });

      expect(await service.roleOf(USER, WS)).to.equal("editor");
    });

    it("не участник — null", async () => {
      expect(await service.roleOf(USER, WS)).to.equal(null);
    });

    it("повторный вызов берётся из кэша, в том числе отрицательный", async () => {
      await service.roleOf(USER, WS);
      await service.roleOf(USER, WS);

      expect(members.findMembership.calledOnce).to.equal(true);
    });

    it("после invalidate читает БД заново", async () => {
      await service.roleOf(USER, WS);
      members.findMembership.resolves({ role: "viewer" });
      await service.invalidate(WS, [USER]);

      expect(await service.roleOf(USER, WS)).to.equal("viewer");
    });

    it("id не uuid — null без запроса в БД", async () => {
      expect(await service.roleOf(USER, "not-a-uuid")).to.equal(null);
      expect(members.findMembership.called).to.equal(false);
    });
  });

  describe("require", () => {
    it("роль покрывает требуемую — возвращает членство", async () => {
      members.findMembership.resolves({ role: "admin" });

      const membership = await service.require(USER, WS, "editor");

      expect(membership).to.deep.equal({
        workspaceId: WS,
        userId: USER,
        role: "admin",
        viaSuperuser: false,
      });
    });

    it("не участник — WORKSPACE_NOT_FOUND (404)", async () => {
      const err = await expectHttpError(
        service.require(ctx(), WS, "viewer"),
        "WORKSPACE_NOT_FOUND",
      );

      expect(err?.status).to.equal(404);
    });

    it("роли не хватает — WORKSPACE_FORBIDDEN (403)", async () => {
      members.findMembership.resolves({ role: "viewer" });

      const err = await expectHttpError(
        service.require(ctx(), WS, "editor"),
        "WORKSPACE_FORBIDDEN",
      );

      expect(err?.status).to.equal(403);
    });

    it("иерархия owner ⊃ admin ⊃ editor ⊃ viewer", async () => {
      members.findMembership.resolves({ role: "owner" });

      for (const role of ["viewer", "editor", "admin", "owner"] as const) {
        await service.invalidate(WS, [USER]);
        expect((await service.require(USER, WS, role)).role).to.equal("owner");
      }
    });

    it("суперпользователь по роли admin проходит без членства", async () => {
      const membership = await service.require(
        ctx({ roles: ["admin"] }),
        WS,
        "owner",
      );

      expect(membership.role).to.equal("owner");
      expect(membership.viaSuperuser).to.equal(true);
      expect(members.findMembership.called).to.equal(false);
    });

    it("суперпользователь по праву «*» проходит без членства", async () => {
      const membership = await service.require(
        ctx({ permissions: ["*"] }),
        WS,
        "owner",
      );

      expect(membership.viaSuperuser).to.equal(true);
    });

    it("суперпользователь: несуществующее пространство — 404", async () => {
      workspaces.existsById.resolves(false);

      await expectHttpError(
        service.require(ctx({ roles: ["admin"] }), WS, "viewer"),
        "WORKSPACE_NOT_FOUND",
      );
    });

    it("по id (сокет, задачи) суперпользователь не учитывается", async () => {
      await expectHttpError(
        service.require(USER, WS, "viewer"),
        "WORKSPACE_NOT_FOUND",
      );
    });
  });
});
