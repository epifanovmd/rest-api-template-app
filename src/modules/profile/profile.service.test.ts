import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockQueryBuilder,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { ProfileService } from "./profile.service";

describe("ProfileService", () => {
  let service: ProfileService;
  let mockProfileRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const fakeProfile = {
    id: uuid2(),
    userId: uuid(),
    firstName: "Test",
    lastName: "User",
    status: "offline",
    user: { id: uuid(), email: "test@example.com" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    mockProfileRepo = {
      ...createMockRepository(),
      findById: sandbox.stub(),
      findByUserId: sandbox.stub(),
    } as any;

    service = new ProfileService(mockProfileRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("getProfiles", () => {
    it("should return paginated profiles", async () => {
      const qb = createMockQueryBuilder();

      mockProfileRepo.createQueryBuilder.returns(qb);
      qb.getManyAndCount.resolves([[fakeProfile], 1]);

      const result = await service.getProfiles(0, 10);

      expect(result).to.deep.equal([[fakeProfile], 1]);
      expect(qb.leftJoinAndSelect.calledOnce).to.be.true;
      expect(qb.orderBy.calledOnce).to.be.true;
      expect(qb.skip.calledWith(0)).to.be.true;
      expect(qb.take.calledWith(10)).to.be.true;
    });

    it("should not apply skip/take when offset and limit not provided", async () => {
      const qb = createMockQueryBuilder();

      mockProfileRepo.createQueryBuilder.returns(qb);
      qb.getManyAndCount.resolves([[], 0]);

      await service.getProfiles();

      expect(qb.skip.called).to.be.false;
      expect(qb.take.called).to.be.false;
    });

    it("should apply skip when only offset provided", async () => {
      const qb = createMockQueryBuilder();

      mockProfileRepo.createQueryBuilder.returns(qb);
      qb.getManyAndCount.resolves([[], 0]);

      await service.getProfiles(5);

      expect(qb.skip.calledWith(5)).to.be.true;
      expect(qb.take.called).to.be.false;
    });

    it("should return empty array when no profiles exist", async () => {
      const qb = createMockQueryBuilder();

      mockProfileRepo.createQueryBuilder.returns(qb);
      qb.getManyAndCount.resolves([[], 0]);

      const result = await service.getProfiles(0, 10);

      expect(result[0]).to.be.an("array").that.is.empty;
      expect(result[1]).to.equal(0);
    });
  });

  describe("getProfileByAttr", () => {
    it("should return profile when found", async () => {
      mockProfileRepo.findOne.resolves(fakeProfile);

      const result = await service.getProfileByAttr({ userId: uuid() });

      expect(result).to.deep.equal(fakeProfile);
    });

    it("should throw NotFoundException when not found", async () => {
      mockProfileRepo.findOne.resolves(null);

      try {
        await service.getProfileByAttr({ userId: "nonexistent" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("getProfileByUserId", () => {
    it("should return profile when found", async () => {
      mockProfileRepo.findByUserId.resolves(fakeProfile);

      const result = await service.getProfileByUserId(uuid());

      expect(result).to.deep.equal(fakeProfile);
      expect(mockProfileRepo.findByUserId.calledWith(uuid())).to.be.true;
    });

    it("should throw NotFoundException when not found", async () => {
      mockProfileRepo.findByUserId.resolves(null);

      try {
        await service.getProfileByUserId("nonexistent");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("updateProfile", () => {
    it("should update and return profile", async () => {
      const updatedProfile = { ...fakeProfile, firstName: "Updated" };

      mockProfileRepo.findByUserId.resolves(updatedProfile);

      const result = await service.updateProfile(uuid(), {
        firstName: "Updated",
      } as any);

      expect(result.firstName).to.equal("Updated");
      expect(mockProfileRepo.update.calledOnce).to.be.true;
      expect(mockProfileRepo.findByUserId.calledWith(uuid())).to.be.true;
    });

    it("should throw NotFoundException when profile not found after update", async () => {
      mockProfileRepo.findByUserId.resolves(null);

      try {
        await service.updateProfile("nonexistent", {
          firstName: "Updated",
        } as any);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("deleteProfile", () => {
    it("should delete and return userId", async () => {
      mockProfileRepo.delete.resolves({ affected: 1 });

      const result = await service.deleteProfile(uuid());

      expect(result).to.equal(uuid());
      expect(mockProfileRepo.delete.calledOnce).to.be.true;
    });

    it("should throw NotFoundException when profile not found", async () => {
      mockProfileRepo.delete.resolves(null);

      try {
        await service.deleteProfile("nonexistent");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Профиль не найден");
      }
    });
  });
});
