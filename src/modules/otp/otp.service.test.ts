import "reflect-metadata";

import { BadRequestException, GoneException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { OtpService } from "./otp.service";

describe("OtpService", () => {
  let service: OtpService;
  let otpRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    otpRepo = createMockRepository();

    (otpRepo as any).findByUserId = sinon.stub().resolves(null);
    (otpRepo as any).findByUserIdAndCode = sinon.stub().resolves(null);

    service = new OtpService(otpRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("create", () => {
    it("should generate a 6-digit code and create new OTP when none exists", async () => {
      (otpRepo as any).findByUserId.resolves(null);
      otpRepo.createAndSave.callsFake((data: any) => Promise.resolve({ id: "otp-1", ...data }));

      const result = await service.create(userId);

      expect((otpRepo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(otpRepo.createAndSave.calledOnce).to.be.true;

      const savedData = otpRepo.createAndSave.firstCall.args[0];

      expect(savedData.userId).to.equal(userId);
      expect(savedData.code).to.be.a("string");
      expect(savedData.code).to.have.lengthOf(6);
      expect(savedData.code).to.match(/^\d{6}$/);
      expect(savedData.expireAt).to.be.instanceOf(Date);
      expect(savedData.expireAt.getTime()).to.be.greaterThan(Date.now());
    });

    it("should update existing OTP when one exists", async () => {
      const existingOtp = { id: "otp-1", userId, code: "123456", expireAt: new Date() };

      (otpRepo as any).findByUserId.resolves(existingOtp);
      otpRepo.save.callsFake((data: any) => Promise.resolve(data));

      const result = await service.create(userId);

      expect(otpRepo.save.calledOnce).to.be.true;
      expect(otpRepo.createAndSave.called).to.be.false;
      // Code should be updated
      expect(existingOtp.code).to.be.a("string").and.have.lengthOf(6);
      expect(existingOtp.expireAt.getTime()).to.be.greaterThan(Date.now());
    });
  });

  describe("check", () => {
    it("should return true and delete OTP when code is valid and not expired", async () => {
      const futureDate = new Date(Date.now() + 600000); // 10 minutes from now
      const otp = { id: "otp-1", userId, code: "123456", expireAt: futureDate };

      (otpRepo as any).findByUserIdAndCode.resolves(otp);

      const result = await service.check(userId, "123456");

      expect(result).to.be.true;
      expect(otpRepo.delete.calledOnceWith({ userId })).to.be.true;
    });

    it("should throw BadRequestException when code is invalid", async () => {
      (otpRepo as any).findByUserIdAndCode.resolves(null);

      try {
        await service.check(userId, "000000");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw GoneException when code is expired", async () => {
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      const otp = { id: "otp-1", userId, code: "123456", expireAt: pastDate };

      (otpRepo as any).findByUserIdAndCode.resolves(otp);

      try {
        await service.check(userId, "123456");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(GoneException);
        expect(otpRepo.delete.calledOnceWith({ userId })).to.be.true;
      }
    });
  });
});
