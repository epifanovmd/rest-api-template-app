import "reflect-metadata";

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import bcrypt from "bcrypt";
import { expect } from "chai";
import jwt from "jsonwebtoken";
import sinon from "sinon";

import { config } from "../../config";
import { uuid } from "../../test/helpers";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let mockUserService: any;
  let mockMailerService: any;
  let mockResetPasswordTokensService: any;
  let mockTokenService: any;
  let mockUserRepository: any;
  let sandbox: sinon.SinonSandbox;

  // Pre-computed bcrypt hash for "password123"
  let passwordHash: string;
  let twoFactorHash: string;

  before(async () => {
    // Compute hashes once for all tests (bcrypt is slow with high rounds)
    passwordHash = await bcrypt.hash("password123", 4);
    twoFactorHash = await bcrypt.hash("2fa-password", 4);
  });

  const makeFakeUser = (overrides: Record<string, any> = {}) => ({
    id: uuid(),
    email: "test@example.com",
    phone: "+71234567890",
    username: null,
    passwordHash,
    emailVerified: false,
    twoFactorHash: null,
    twoFactorHint: null,
    roles: [{ name: "USER", permissions: [], toDTO: () => ({ name: "USER" }) }],
    directPermissions: [],
    profile: { firstName: "Test", lastName: "User" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const fakeTokens = {
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    mockUserService = {
      getUserByAttr: sandbox.stub(),
      getUser: sandbox.stub(),
      createUser: sandbox.stub(),
      changePassword: sandbox.stub(),
    };

    mockMailerService = {
      sendResetPasswordMail: sandbox.stub().resolves(),
    };

    mockResetPasswordTokensService = {
      create: sandbox.stub(),
      check: sandbox.stub(),
    };

    mockTokenService = {
      issue: sandbox.stub().resolves(fakeTokens),
    };

    mockUserRepository = {
      update: sandbox.stub().resolves({ affected: 1 }),
    };

    service = new AuthService(
      mockUserService,
      mockMailerService,
      mockResetPasswordTokensService,
      mockTokenService,
      mockUserRepository,
    );
  });

  afterEach(() => sandbox.restore());

  describe("signUp", () => {
    it("should create user and return tokens via signIn", async () => {
      const fakeUser = makeFakeUser();

      // getUserByAttr: first call (existence check) throws NotFound, second call (in signIn) returns user
      mockUserService.getUserByAttr
        .onFirstCall()
        .rejects(new NotFoundException("not found"));
      mockUserService.getUserByAttr
        .onSecondCall()
        .resolves(fakeUser);
      mockUserService.createUser.resolves(fakeUser);
      mockUserService.getUser.resolves(fakeUser);

      const result = await service.signUp({
        email: "test@example.com",
        password: "password123",
      });

      expect(result).to.have.property("tokens");
      expect(mockUserService.createUser.calledOnce).to.be.true;
    });

    it("should throw BadRequestException when login is missing", async () => {
      try {
        await service.signUp({
          password: "password123",
        } as any);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect(err.message).to.include("email");
      }
    });

    it("should throw BadRequestException when user already exists", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUserByAttr.resolves(fakeUser);

      try {
        await service.signUp({
          email: "test@example.com",
          password: "password123",
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect(err.message).to.include("уже зарегистрирован");
      }
    });

    it("should signUp with phone instead of email", async () => {
      const fakeUser = makeFakeUser({ email: null, phone: "+79001234567" });

      mockUserService.getUserByAttr
        .onFirstCall()
        .rejects(new NotFoundException("not found"));
      mockUserService.getUserByAttr
        .onSecondCall()
        .resolves(fakeUser);
      mockUserService.createUser.resolves(fakeUser);
      mockUserService.getUser.resolves(fakeUser);

      const result = await service.signUp({
        phone: "+79001234567",
        password: "password123",
      });

      expect(result).to.have.property("tokens");
    });
  });

  describe("signIn", () => {
    it("should return user with tokens on valid credentials", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUserByAttr.resolves(fakeUser);
      mockUserService.getUser.resolves(fakeUser);

      const result = await service.signIn({
        login: "test@example.com",
        password: "password123",
      });

      expect(result).to.have.property("tokens");
      expect(mockTokenService.issue.calledOnce).to.be.true;
    });

    it("should throw UnauthorizedException on invalid password", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUserByAttr.resolves(fakeUser);

      try {
        await service.signIn({
          login: "test@example.com",
          password: "wrong-password",
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Не верный логин или пароль");
      }
    });

    it("should throw UnauthorizedException when user not found", async () => {
      // Both email and phone lookups fail
      mockUserService.getUserByAttr.rejects(
        new NotFoundException("not found"),
      );

      try {
        await service.signIn({
          login: "nonexistent@example.com",
          password: "password123",
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Не верный логин или пароль");
      }
    });

    it("should return require2FA when 2FA is enabled", async () => {
      const fakeUser = makeFakeUser({
        twoFactorHash,
        twoFactorHint: "my hint",
      });

      mockUserService.getUserByAttr.resolves(fakeUser);

      const result = await service.signIn({
        login: "test@example.com",
        password: "password123",
      });

      expect(result).to.have.property("require2FA", true);
      expect(result).to.have.property("twoFactorToken");
      expect(result).to.have.property("twoFactorHint", "my hint");

      // Verify the 2FA token is a valid JWT
      const decoded: any = jwt.verify(
        (result as any).twoFactorToken,
        config.auth.jwt.secretKey,
      );

      expect(decoded).to.have.property("userId", uuid());
      expect(decoded).to.have.property("type", "2fa");
    });

    it("should try phone lookup when email lookup fails", async () => {
      const fakeUser = makeFakeUser();

      // First call (by email) throws NotFoundException, second call (by phone) succeeds
      mockUserService.getUserByAttr
        .onFirstCall()
        .rejects(new NotFoundException("not found"));
      mockUserService.getUserByAttr
        .onSecondCall()
        .resolves(fakeUser);
      mockUserService.getUser.resolves(fakeUser);

      const result = await service.signIn({
        login: "test@example.com",
        password: "password123",
      });

      expect(result).to.have.property("tokens");
      expect(mockUserService.getUserByAttr.calledTwice).to.be.true;
    });

    it("should use phone lookup first for non-email login", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUserByAttr.resolves(fakeUser);
      mockUserService.getUser.resolves(fakeUser);

      const result = await service.signIn({
        login: "+71234567890",
        password: "password123",
      });

      expect(result).to.have.property("tokens");
      // For phone login (no @), first call should be phone lookup
      const firstCallArg = mockUserService.getUserByAttr.firstCall.args[0];

      expect(firstCallArg).to.have.property("phone");
    });
  });

  describe("requestResetPassword", () => {
    it("should send reset email when user exists with email", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUserByAttr.resolves(fakeUser);
      mockResetPasswordTokensService.create.resolves({
        token: "reset-token-123",
      });

      const result = await service.requestResetPassword("test@example.com");

      expect(result).to.have.property("message");
      expect(result.message).to.include("Ссылка для сброса пароля отправлена");
      expect(mockMailerService.sendResetPasswordMail.calledOnce).to.be.true;
      expect(
        mockMailerService.sendResetPasswordMail.calledWith(
          "test@example.com",
          "reset-token-123",
        ),
      ).to.be.true;
    });

    it("should return success message even when user not found", async () => {
      mockUserService.getUserByAttr.rejects(
        new NotFoundException("not found"),
      );

      const result = await service.requestResetPassword(
        "nonexistent@example.com",
      );

      expect(result).to.have.property("message");
      expect(result.message).to.include("Если пользователь");
      expect(mockMailerService.sendResetPasswordMail.called).to.be.false;
    });

    it("should return success message when user has no email", async () => {
      const fakeUser = makeFakeUser({ email: null });

      mockUserService.getUserByAttr.resolves(fakeUser);

      const result = await service.requestResetPassword("+71234567890");

      expect(result).to.have.property("message");
      // NotFoundException for missing email is caught and returns generic message
      expect(result.message).to.include("Если пользователь");
    });
  });

  describe("resetPassword", () => {
    it("should change password when token is valid", async () => {
      mockResetPasswordTokensService.check.resolves({ userId: uuid() });
      mockUserService.changePassword.resolves({
        message: "Пароль успешно изменен.",
      });

      const result = await service.resetPassword(
        "valid-token",
        "new-password",
      );

      expect(result).to.have.property("message");
      expect(result.message).to.include("Пароль успешно сброшен");
      expect(mockUserService.changePassword.calledOnce).to.be.true;
      expect(
        mockUserService.changePassword.calledWith(uuid(), "new-password"),
      ).to.be.true;
    });
  });

  describe("updateTokens", () => {
    it("should return new tokens with valid refresh token", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUser.resolves(fakeUser);

      // Create a real valid JWT token for the test
      const validRefreshToken = jwt.sign(
        { userId: uuid() },
        config.auth.jwt.secretKey,
        { expiresIn: "7d" },
      );

      const result = await service.updateTokens(validRefreshToken);

      expect(result).to.deep.equal(fakeTokens);
      expect(mockTokenService.issue.calledOnce).to.be.true;
    });

    it("should throw UnauthorizedException when token is missing", async () => {
      try {
        await service.updateTokens(undefined);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Токен отсутствует");
      }
    });

    it("should throw UnauthorizedException when token is empty string", async () => {
      try {
        await service.updateTokens("");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Токен отсутствует");
      }
    });

    it("should throw when token is invalid JWT", async () => {
      try {
        await service.updateTokens("invalid-jwt-garbage");
        expect.fail("Should have thrown");
      } catch (err: any) {
        // verifyToken rejects with jwt error
        expect(err).to.exist;
      }
    });
  });

  describe("enable2FA", () => {
    it("should enable 2FA for user without existing 2FA", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUser.resolves(fakeUser);

      const result = await service.enable2FA(uuid(), "2fa-password", "my hint");

      expect(result).to.have.property("message");
      expect(result.message).to.include("2FA успешно включена");
      expect(mockUserRepository.update.calledOnce).to.be.true;

      // Verify that the hash was stored
      const updateArgs = mockUserRepository.update.firstCall.args;

      expect(updateArgs[0]).to.equal(uuid());
      expect(updateArgs[1]).to.have.property("twoFactorHash");
      expect(updateArgs[1]).to.have.property("twoFactorHint", "my hint");
    });

    it("should throw BadRequestException if 2FA already enabled", async () => {
      const fakeUser = makeFakeUser({ twoFactorHash: "$2b$12$existing" });

      mockUserService.getUser.resolves(fakeUser);

      try {
        await service.enable2FA(uuid(), "2fa-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect(err.message).to.include("2FA уже включена");
      }
    });

    it("should set twoFactorHint to null when hint is not provided", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUser.resolves(fakeUser);

      await service.enable2FA(uuid(), "2fa-password");

      const updateArgs = mockUserRepository.update.firstCall.args;

      expect(updateArgs[1].twoFactorHint).to.be.null;
    });
  });

  describe("disable2FA", () => {
    it("should disable 2FA with correct password", async () => {
      const fakeUser = makeFakeUser({ twoFactorHash });

      mockUserService.getUser.resolves(fakeUser);

      const result = await service.disable2FA(uuid(), "2fa-password");

      expect(result).to.have.property("message");
      expect(result.message).to.include("2FA успешно отключена");
      expect(mockUserRepository.update.calledOnce).to.be.true;
      const updateArgs = mockUserRepository.update.firstCall.args;

      expect(updateArgs[1].twoFactorHash).to.be.null;
      expect(updateArgs[1].twoFactorHint).to.be.null;
    });

    it("should throw BadRequestException if 2FA not enabled", async () => {
      const fakeUser = makeFakeUser();

      mockUserService.getUser.resolves(fakeUser);

      try {
        await service.disable2FA(uuid(), "2fa-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect(err.message).to.include("2FA не включена");
      }
    });

    it("should throw UnauthorizedException with wrong 2FA password", async () => {
      const fakeUser = makeFakeUser({ twoFactorHash });

      mockUserService.getUser.resolves(fakeUser);

      try {
        await service.disable2FA(uuid(), "wrong-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Неверный пароль 2FA");
      }
    });
  });

  describe("verify2FA", () => {
    it("should return user with tokens on valid 2FA verification", async () => {
      const fakeUser = makeFakeUser({ twoFactorHash });

      mockUserService.getUser.resolves(fakeUser);

      // Create a real 2FA token
      const twoFactorToken = jwt.sign(
        { userId: uuid(), type: "2fa" },
        config.auth.jwt.secretKey,
        { expiresIn: "5m" },
      );

      const result = await service.verify2FA(twoFactorToken, "2fa-password");

      expect(result).to.have.property("tokens");
      expect(mockTokenService.issue.calledOnce).to.be.true;
    });

    it("should throw UnauthorizedException with wrong token type", async () => {
      const wrongTypeToken = jwt.sign(
        { userId: uuid(), type: "access" },
        config.auth.jwt.secretKey,
        { expiresIn: "5m" },
      );

      try {
        await service.verify2FA(wrongTypeToken, "2fa-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Неверный токен 2FA");
      }
    });

    it("should throw UnauthorizedException with wrong 2FA password", async () => {
      const fakeUser = makeFakeUser({ twoFactorHash });

      mockUserService.getUser.resolves(fakeUser);

      const twoFactorToken = jwt.sign(
        { userId: uuid(), type: "2fa" },
        config.auth.jwt.secretKey,
        { expiresIn: "5m" },
      );

      try {
        await service.verify2FA(twoFactorToken, "wrong-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(UnauthorizedException);
        expect(err.message).to.include("Неверный пароль 2FA");
      }
    });

    it("should throw BadRequestException when 2FA not enabled for user", async () => {
      const fakeUser = makeFakeUser(); // twoFactorHash is null

      mockUserService.getUser.resolves(fakeUser);

      const twoFactorToken = jwt.sign(
        { userId: uuid(), type: "2fa" },
        config.auth.jwt.secretKey,
        { expiresIn: "5m" },
      );

      try {
        await service.verify2FA(twoFactorToken, "2fa-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(BadRequestException);
        expect(err.message).to.include("2FA не включена");
      }
    });

    it("should throw when token is invalid JWT", async () => {
      try {
        await service.verify2FA("invalid-jwt", "2fa-password");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });
});
