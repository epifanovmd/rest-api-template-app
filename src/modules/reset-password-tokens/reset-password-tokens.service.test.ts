import "reflect-metadata";

import { BadRequestException } from "@force-dev/utils";
import { expect } from "chai";
import jwt from "jsonwebtoken";
import sinon from "sinon";

import { config } from "../../config";
import { createMockRepository, uuid } from "../../test/helpers";
import { ResetPasswordTokensService } from "./reset-password-tokens.service";

describe("ResetPasswordTokensService", () => {
  let service: ResetPasswordTokensService;
  let repo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  // Create a real JWT token for testing
  const testToken = jwt.sign(
    { userId, roles: [], permissions: [], emailVerified: false },
    config.auth.jwt.secretKey,
    { expiresIn: "60m" },
  );

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    repo = createMockRepository();

    (repo as any).findByUserId = sinon.stub().resolves(null);
    (repo as any).findByToken = sinon.stub().resolves(null);

    service = new ResetPasswordTokensService(repo as any);
  });

  afterEach(() => sandbox.restore());

  describe("create", () => {
    it("should generate JWT token and create new record when none exists", async () => {
      (repo as any).findByUserId.resolves(null);
      repo.createAndSave.callsFake(async (data: any) => ({ id: "rpt-1", ...data }));

      const result = await service.create(userId);

      expect((repo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(repo.createAndSave.calledOnce).to.be.true;

      const savedData = repo.createAndSave.firstCall.args[0];

      expect(savedData.userId).to.equal(userId);
      expect(savedData.token).to.be.a("string");
      // Verify the generated token is a valid JWT
      const decoded = jwt.verify(savedData.token, config.auth.jwt.secretKey) as any;

      expect(decoded.userId).to.equal(userId);
    });

    it("should update existing token when one exists (upsert)", async () => {
      const existing = { id: "rpt-1", userId, token: "old-token" };

      (repo as any).findByUserId.resolves(existing);
      repo.save.callsFake(async (data: any) => data);

      await service.create(userId);

      expect(existing.token).to.be.a("string");
      expect(existing.token).to.not.equal("old-token");
      expect(repo.save.calledOnce).to.be.true;
      expect(repo.createAndSave.called).to.be.false;
    });
  });

  describe("check", () => {
    it("should verify token, delete record, and return userId on valid token", async () => {
      const tokenRecord = { id: "rpt-1", userId, token: testToken };

      (repo as any).findByToken.resolves(tokenRecord);
      repo.delete.resolves({ affected: 1 });

      const result = await service.check(testToken);

      expect((repo as any).findByToken.calledOnceWith(testToken)).to.be.true;
      expect(repo.delete.calledOnceWith(userId)).to.be.true;
      expect(result.userId).to.equal(userId);
      expect(result.token).to.equal(testToken);
    });

    it("should throw when JWT verification fails (invalid token)", async () => {
      try {
        await service.check("bad-token");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.name).to.equal("JsonWebTokenError");
      }
    });

    it("should throw BadRequestException when token is not found in DB", async () => {
      (repo as any).findByToken.resolves(null);

      try {
        await service.check(testToken);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });
});
