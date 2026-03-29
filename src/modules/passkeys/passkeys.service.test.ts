import "reflect-metadata";

import {
  InternalServerErrorException,
  NotFoundException,
} from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { PasskeysService } from "./passkeys.service";

describe("PasskeysService", () => {
  let service: PasskeysService;
  let userService: Record<string, sinon.SinonStub>;
  let passkeysRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let sessionService: Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const passkeyId = "credential-id-123";

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: userId,
    email: "test@example.com",
    phone: "+79991234567",
    challenge: null as string | null,
    challengeExpiresAt: null as Date | null,
    ...overrides,
  });

  const makePasskey = (overrides: Record<string, unknown> = {}) => ({
    id: passkeyId,
    userId,
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    deviceType: "singleDevice",
    transports: ["internal"],
    lastUsed: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    passkeysRepo = createMockRepository() as any;
    userService = {
      getUser: sinon.stub().resolves(makeUser()),
      getUserByAttr: sinon.stub().resolves(makeUser()),
    };
    sessionService = {
      createAuthenticatedSession: sinon.stub().resolves({
        sessionId: "session-1",
        tokens: { accessToken: "at", refreshToken: "rt" },
      }),
    };

    // Custom repo methods
    passkeysRepo.findById = sinon.stub().resolves(null);
    passkeysRepo.findByUserId = sinon.stub().resolves([]);
    passkeysRepo.findByUserIdAndId = sinon.stub().resolves(null);

    const challengeRepo = {
      createChallenge: sinon.stub().resolves({ id: "ch-1", challenge: "test-challenge" }),
      findValidChallenge: sinon.stub().resolves({ challenge: "test-challenge" }),
      deleteByUserId: sinon.stub().resolves(),
    };

    service = new PasskeysService(
      userService as any,
      passkeysRepo as any,
      challengeRepo as any,
      sessionService as any,
    );
  });

  afterEach(() => sandbox.restore());

  // ───── generateRegistrationOptions ─────

  describe("generateRegistrationOptions", () => {
    it("should throw InternalServerErrorException when user has no email/phone", async () => {
      userService.getUser.resolves(makeUser({ email: null, phone: null }));

      try {
        await service.generateRegistrationOptions(userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(InternalServerErrorException);
        expect((err as any).message).to.include("email и телефон");
      }
    });

    // NOTE: Testing the full success path requires mocking @simplewebauthn/server
    // which is difficult with ESM. We test the pre-condition checks instead.
  });

  // ───── verifyRegistration ─────

  describe("verifyRegistration", () => {
    it("should throw InternalServerErrorException when no valid challenge", async () => {
      // challengeRepo.findValidChallenge returns null by default in beforeEach override
      const challengeRepo = (service as any)._challengeRepo;

      challengeRepo.findValidChallenge = sinon.stub().resolves(null);

      try {
        await service.verifyRegistration(userId, {} as any);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(InternalServerErrorException);
        expect((err as any).message).to.include("Challenge не найден или истёк");
      }
    });

    it("should throw InternalServerErrorException when verification fails", async () => {

      try {
        await service.verifyRegistration(userId, {} as any);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(InternalServerErrorException);
        expect((err as any).message).to.include("Ошибка верификации регистрации");
      }
    });
  });

  // ───── generateAuthenticationOptions ─────

  describe("generateAuthenticationOptions", () => {
    it("should throw NotFoundException when user not found by email", async () => {
      userService.getUserByAttr.rejects(new NotFoundException("User not found"));

      try {
        await service.generateAuthenticationOptions("unknown@test.com");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
        expect((err as any).message).to.include("Passkey не найден");
      }
    });

    it("should throw NotFoundException when user not found by phone", async () => {
      userService.getUserByAttr.rejects(new NotFoundException("User not found"));

      try {
        await service.generateAuthenticationOptions("+79990000000");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
        expect((err as any).message).to.include("Passkey не найден");
      }
    });

    it("should throw NotFoundException when user has no passkeys", async () => {
      userService.getUserByAttr.resolves(makeUser());
      passkeysRepo.findByUserId.resolves([]);

      try {
        await service.generateAuthenticationOptions("test@example.com");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
        expect((err as any).message).to.include("Passkey не найден");
      }
    });

    it("should re-throw non-NotFoundException errors", async () => {
      const error = new Error("DB connection lost");

      userService.getUserByAttr.rejects(error);

      try {
        await service.generateAuthenticationOptions("test@example.com");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.equal(error);
      }
    });
  });

  // ───── verifyAuthentication ─────

  describe("verifyAuthentication", () => {
    it("should throw NotFoundException when passkey not found", async () => {
      passkeysRepo.findById.resolves(null);

      try {
        await service.verifyAuthentication({ id: "nonexistent" } as any);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
        expect((err as any).message).to.include("Passkey");
      }
    });

    it("should throw InternalServerErrorException when no valid challenge", async () => {
      passkeysRepo.findById.resolves(makePasskey());
      userService.getUser.resolves(makeUser());

      const challengeRepo = (service as any)._challengeRepo;

      challengeRepo.findValidChallenge = sinon.stub().resolves(null);

      try {
        await service.verifyAuthentication({ id: passkeyId } as any);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(InternalServerErrorException);
        expect((err as any).message).to.include("Challenge не найден или истёк");
      }
    });

    it("should throw InternalServerErrorException when verification fails", async () => {
      passkeysRepo.findById.resolves(makePasskey());
      userService.getUser.resolves(makeUser());

      try {
        await service.verifyAuthentication({ id: passkeyId } as any);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(InternalServerErrorException);
        expect((err as any).message).to.include("Ошибка верификации аутентификации");
      }
    });
  });
});
