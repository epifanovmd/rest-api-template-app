import "reflect-metadata";

import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import { expect } from "chai";
import jwt from "jsonwebtoken";
import sinon from "sinon";

import { config } from "../../config";
import { ERole } from "../../modules/role/role.types";
import { TokenService } from "./token.service";

describe("TokenService", () => {
  let service: TokenService;
  let sandbox: sinon.SinonSandbox;
  const secretKey = config.auth.jwt.secretKey;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new TokenService();
  });

  afterEach(() => sandbox.restore());

  const makeUser = (overrides: Record<string, any> = {}) =>
    ({
      id: "user-1",
      emailVerified: true,
      roles: [
        {
          name: ERole.USER,
          permissions: [{ name: "chat:view" }, { name: "chat:manage" }],
        },
      ],
      directPermissions: [{ name: "user:view" }],
      ...overrides,
    }) as any;

  describe("issue", () => {
    it("creates tokens with correct payload (roles, merged permissions, emailVerified)", async () => {
      const user = makeUser();
      const result = await service.issue(user);

      expect(result).to.have.property("accessToken").that.is.a("string");
      expect(result).to.have.property("refreshToken").that.is.a("string");

      const decoded = jwt.verify(result.accessToken, secretKey) as any;

      expect(decoded.userId).to.equal("user-1");
      expect(decoded.roles).to.deep.equal([ERole.USER]);
      expect(decoded.permissions).to.include.members([
        "chat:view",
        "chat:manage",
        "user:view",
      ]);
      expect(decoded.emailVerified).to.be.true;
    });

    it("deduplicates permissions from roles and direct", async () => {
      const user = makeUser({
        roles: [
          {
            name: ERole.USER,
            permissions: [{ name: "user:view" }],
          },
        ],
        directPermissions: [{ name: "user:view" }],
      });

      const result = await service.issue(user);
      const decoded = jwt.verify(result.accessToken, secretKey) as any;

      expect(decoded.permissions).to.deep.equal(["user:view"]);
    });

    it("handles empty roles and permissions", async () => {
      const user = makeUser({
        roles: [],
        directPermissions: [],
      });

      const result = await service.issue(user);
      const decoded = jwt.verify(result.accessToken, secretKey) as any;

      expect(decoded.roles).to.deep.equal([]);
      expect(decoded.permissions).to.deep.equal([]);
    });

    it("handles undefined roles and permissions", async () => {
      const user = makeUser({
        roles: undefined,
        directPermissions: undefined,
      });

      const result = await service.issue(user);
      const decoded = jwt.verify(result.accessToken, secretKey) as any;

      expect(decoded.roles).to.deep.equal([]);
      expect(decoded.permissions).to.deep.equal([]);
    });
  });

  describe("verify", () => {
    const createToken = (payload: Record<string, any>) =>
      jwt.sign(payload, secretKey);

    it("valid token returns AuthContext", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [ERole.USER],
        permissions: ["chat:view"],
        emailVerified: true,
      });

      const result = await service.verify(token);

      expect(result.userId).to.equal("user-1");
      expect(result.roles).to.deep.equal([ERole.USER]);
      expect(result.permissions).to.deep.equal(["chat:view"]);
      expect(result.emailVerified).to.be.true;
    });

    it("no token throws UnauthorizedException", async () => {
      try {
        await service.verify(undefined);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(UnauthorizedException);
      }
    });

    it("invalid token throws UnauthorizedException", async () => {
      try {
        await service.verify("invalid.token.here");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(UnauthorizedException);
      }
    });

    it("with scopes, user has required role - passes", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [ERole.USER],
        permissions: [],
        emailVerified: true,
      });

      const result = await service.verify(token, ["role:user"]);

      expect(result.userId).to.equal("user-1");
    });

    it("with scopes, user missing role throws ForbiddenException", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [ERole.GUEST],
        permissions: [],
        emailVerified: true,
      });

      try {
        await service.verify(token, ["role:user"]);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("admin role bypasses all scope checks", async () => {
      const token = createToken({
        userId: "admin-1",
        roles: [ERole.ADMIN],
        permissions: [],
        emailVerified: true,
      });

      const result = await service.verify(token, [
        "role:user",
        "permission:chat:manage",
      ]);

      expect(result.userId).to.equal("admin-1");
    });

    it("* permission bypasses all scope checks", async () => {
      const token = createToken({
        userId: "super-1",
        roles: [ERole.USER],
        permissions: ["*"],
        emailVerified: true,
      });

      const result = await service.verify(token, [
        "role:admin",
        "permission:chat:manage",
      ]);

      expect(result.userId).to.equal("super-1");
    });

    it("permission wildcard chat:* matches permission:chat:view", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [ERole.USER],
        permissions: ["chat:*"],
        emailVerified: true,
      });

      const result = await service.verify(token, ["permission:chat:view"]);

      expect(result.userId).to.equal("user-1");
    });

    it("missing permission throws ForbiddenException", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [ERole.USER],
        permissions: ["chat:view"],
        emailVerified: true,
      });

      try {
        await service.verify(token, ["permission:user:manage"]);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("empty scopes array skips scope checking", async () => {
      const token = createToken({
        userId: "user-1",
        roles: [],
        permissions: [],
        emailVerified: false,
      });

      const result = await service.verify(token, []);

      expect(result.userId).to.equal("user-1");
      expect(result.emailVerified).to.be.false;
    });
  });
});
