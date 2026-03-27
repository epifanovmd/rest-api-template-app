import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { UserService } from "./user.service";

describe("UserService", () => {
  let service: UserService;
  let mockUserRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let mockRoleRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let mockPermissionRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let mockProfileRepo: ReturnType<typeof createMockRepository> & Record<string, sinon.SinonStub>;
  let mockMailerService: any;
  let mockOtpService: any;
  let sandbox: sinon.SinonSandbox;

  const fakeRole = { id: uuid2(), name: "USER", permissions: [] };
  const fakeProfile = {
    id: uuid2(),
    userId: uuid(),
    firstName: "Test",
    lastName: "User",
    status: "offline",
  };
  const fakeUser = {
    id: uuid(),
    email: "test@example.com",
    phone: "+71234567890",
    username: "testuser",
    passwordHash: "$2b$12$hashedpassword",
    emailVerified: false,
    twoFactorHash: null,
    twoFactorHint: null,
    roles: [fakeRole],
    directPermissions: [],
    profile: fakeProfile,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    mockUserRepo = {
      ...createMockRepository(),
      findByEmailOrPhone: sandbox.stub(),
      findById: sandbox.stub(),
      updateWithResponse: sandbox.stub(),
      findByUsername: sandbox.stub(),
      searchByQuery: sandbox.stub(),
      findOptions: sandbox.stub(),
    } as any;

    mockRoleRepo = {
      ...createMockRepository(),
      findByName: sandbox.stub(),
    } as any;

    mockPermissionRepo = {
      ...createMockRepository(),
      findByName: sandbox.stub(),
    } as any;

    mockProfileRepo = {
      ...createMockRepository(),
      findByUserId: sandbox.stub(),
    } as any;

    mockMailerService = {
      sendCodeMail: sandbox.stub().resolves(),
    };

    mockOtpService = {
      create: sandbox.stub(),
      check: sandbox.stub(),
    };

    service = new UserService(
      mockMailerService,
      mockOtpService,
      mockUserRepo as any,
      mockRoleRepo as any,
      mockPermissionRepo as any,
      mockProfileRepo as any,
      { transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns({
        create: sinon.stub().callsFake((data: any) => ({ id: uuid(), ...data })),
        save: sinon.stub().callsFake((data: any) => Promise.resolve({ id: uuid(), ...data })),
      }) })) } as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("getUsers", () => {
    it("should return paginated users", async () => {
      mockUserRepo.findAndCount.resolves([[fakeUser], 1]);

      const result = await service.getUsers(0, 10);

      expect(result).to.deep.equal([[fakeUser], 1]);
      expect(mockUserRepo.findAndCount.calledOnce).to.be.true;
    });

    it("should filter by email query when provided", async () => {
      mockUserRepo.findAndCount.resolves([[fakeUser], 1]);

      await service.getUsers(0, 10, "test");

      const callArgs = mockUserRepo.findAndCount.firstCall.args[0];

      expect(callArgs.where).to.be.an("array");
    });

    it("should pass undefined where when no query provided", async () => {
      mockUserRepo.findAndCount.resolves([[], 0]);

      await service.getUsers(0, 10);

      const callArgs = mockUserRepo.findAndCount.firstCall.args[0];

      expect(callArgs.where).to.be.undefined;
    });
  });

  describe("getOptions", () => {
    it("should return user options", async () => {
      const options = [{ id: uuid(), name: "Test User" }];

      mockUserRepo.findOptions.resolves(options);

      const result = await service.getOptions("test");

      expect(result).to.deep.equal(options);
      expect(mockUserRepo.findOptions.calledWith("test")).to.be.true;
    });
  });

  describe("getUserByAttr", () => {
    it("should return user when found by email", async () => {
      mockUserRepo.findByEmailOrPhone.resolves(fakeUser);

      const result = await service.getUserByAttr({ email: "test@example.com" });

      expect(result).to.deep.equal(fakeUser);
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUserRepo.findByEmailOrPhone.resolves(null);

      try {
        await service.getUserByAttr({ email: "none@example.com" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("getUser", () => {
    it("should return user when found", async () => {
      mockUserRepo.findOne.resolves(fakeUser);

      const result = await service.getUser(uuid());

      expect(result).to.deep.equal(fakeUser);
      expect(mockUserRepo.findOne.calledOnce).to.be.true;
    });

    it("should throw NotFoundException when not found", async () => {
      mockUserRepo.findOne.resolves(null);

      try {
        await service.getUser("nonexistent-id");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("createUser", () => {
    it("should create user, profile, and assign USER role", async () => {
      const createdUser = { ...fakeUser, id: uuid() };

      mockRoleRepo.findByName.resolves(fakeRole);
      mockUserRepo.findById.resolves(createdUser);
      mockUserRepo.save.resolves(createdUser);
      mockUserRepo.findOne.resolves(createdUser);

      const result = await service.createUser({
        email: "new@example.com",
        passwordHash: "$2b$12$hashed",
      });

      expect(result).to.exist;
    });
  });

  describe("createAdmin", () => {
    it("should throw ConflictException if user already exists", async () => {
      mockUserRepo.findByEmailOrPhone.resolves(fakeUser);

      try {
        await service.createAdmin({
          email: "test@example.com",
          passwordHash: "$2b$12$hashed",
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("уже существует");
      }
    });

    it("should create admin user when not existing", async () => {
      mockUserRepo.findByEmailOrPhone.resolves(null);
      mockRoleRepo.findByName.resolves(fakeRole);
      mockUserRepo.findById.resolves(fakeUser);
      mockUserRepo.save.resolves(fakeUser);
      mockUserRepo.findOne.resolves(fakeUser);

      const result = await service.createAdmin({
        email: "admin@example.com",
        passwordHash: "$2b$12$hashed",
      });

      expect(result).to.exist;
    });
  });

  describe("updateUser", () => {
    it("should update and return user", async () => {
      const updatedUser = { ...fakeUser, email: "updated@example.com" };

      mockUserRepo.updateWithResponse.resolves(updatedUser);

      const result = await service.updateUser(uuid(), {
        email: "updated@example.com",
      } as any);

      expect(result.email).to.equal("updated@example.com");
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUserRepo.updateWithResponse.resolves(null);

      try {
        await service.updateUser("nonexistent", {} as any);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });

  describe("setChallenge", () => {
    it("should set challenge for user", async () => {
      await service.setChallenge(uuid(), "test-challenge");

      expect(mockUserRepo.update.calledOnce).to.be.true;
      const updateArgs = mockUserRepo.update.firstCall.args;

      expect(updateArgs[0]).to.equal(uuid());
      expect(updateArgs[1]).to.have.property("challenge", "test-challenge");
    });

    it("should clear challenge when null passed", async () => {
      await service.setChallenge(uuid(), null);

      const updateArgs = mockUserRepo.update.firstCall.args;

      expect(updateArgs[1].challenge).to.be.null;
      expect(updateArgs[1].challengeExpiresAt).to.be.null;
    });
  });

  describe("setPrivileges", () => {
    it("should assign roles and permissions to user", async () => {
      mockUserRepo.findById.resolves({ ...fakeUser, roles: [], directPermissions: [] });
      mockRoleRepo.findByName.resolves(fakeRole);
      mockPermissionRepo.findByName.resolves({ id: "perm-1", name: "test:perm" });
      mockUserRepo.save.resolves(fakeUser);
      mockUserRepo.findOne.resolves(fakeUser);

      const result = await service.setPrivileges(uuid(), {
        roles: ["USER" as any],
        permissions: ["test:perm" as any],
      });

      expect(result).to.exist;
      expect(mockUserRepo.save.calledOnce).to.be.true;
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUserRepo.findById.resolves(null);

      try {
        await service.setPrivileges("nonexistent", {
          roles: ["USER" as any],
          permissions: [],
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });

    it("should create role if not found", async () => {
      mockUserRepo.findById.resolves({ ...fakeUser, roles: [], directPermissions: [] });
      mockRoleRepo.findByName.resolves(null);
      mockRoleRepo.createAndSave.resolves(fakeRole);
      mockUserRepo.save.resolves(fakeUser);
      mockUserRepo.findOne.resolves(fakeUser);

      await service.setPrivileges(uuid(), {
        roles: ["NEW_ROLE" as any],
        permissions: [],
      });

      expect(mockRoleRepo.createAndSave.calledOnce).to.be.true;
    });

    it("should create permission if not found", async () => {
      mockUserRepo.findById.resolves({ ...fakeUser, roles: [], directPermissions: [] });
      mockRoleRepo.findByName.resolves(fakeRole);
      mockPermissionRepo.findByName.resolves(null);
      mockPermissionRepo.createAndSave.resolves({ id: "perm-1", name: "new:perm" });
      mockUserRepo.save.resolves(fakeUser);
      mockUserRepo.findOne.resolves(fakeUser);

      await service.setPrivileges(uuid(), {
        roles: ["USER" as any],
        permissions: ["new:perm" as any],
      });

      expect(mockPermissionRepo.createAndSave.calledOnce).to.be.true;
    });
  });

  describe("requestVerifyEmail", () => {
    it("should send OTP code to user email", async () => {
      mockUserRepo.findOne.resolves(fakeUser);
      mockOtpService.create.resolves({ code: "123456" });

      const result = await service.requestVerifyEmail(uuid());

      expect(result).to.be.true;
      expect(mockMailerService.sendCodeMail.calledOnce).to.be.true;
      expect(mockMailerService.sendCodeMail.calledWith("test@example.com", "123456")).to.be.true;
    });

    it("should throw ConflictException if email already verified", async () => {
      mockUserRepo.findOne.resolves({ ...fakeUser, emailVerified: true });

      try {
        await service.requestVerifyEmail(uuid());
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Email уже подтвержден");
      }
    });

    it("should throw NotFoundException if user has no email", async () => {
      mockUserRepo.findOne.resolves({
        ...fakeUser,
        email: null,
        emailVerified: false,
      });

      try {
        await service.requestVerifyEmail(uuid());
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("отсутствует email");
      }
    });
  });

  describe("verifyEmail", () => {
    it("should verify email with valid OTP code", async () => {
      mockUserRepo.findOne.resolves(fakeUser);
      mockOtpService.check.resolves(true);

      const result = await service.verifyEmail(uuid(), "123456");

      expect(result).to.have.property("message");
      expect(result.message).to.include("Email успешно подтвержден");
      expect(mockUserRepo.update.calledOnce).to.be.true;
    });

    it("should throw ConflictException if email already verified", async () => {
      mockUserRepo.findOne.resolves({ ...fakeUser, emailVerified: true });

      try {
        await service.verifyEmail(uuid(), "123456");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Email уже подтвержден");
      }
    });

    it("should not update emailVerified when OTP is invalid", async () => {
      mockUserRepo.findOne.resolves(fakeUser);
      mockOtpService.check.resolves(false);

      const result = await service.verifyEmail(uuid(), "wrong");

      expect(result).to.have.property("message");
      // update should NOT be called because otp check returned false
      expect(mockUserRepo.update.called).to.be.false;
    });
  });

  describe("changePassword", () => {
    it("should hash and save new password", async () => {
      const result = await service.changePassword(uuid(), "new-password");

      expect(result).to.have.property("message");
      expect(result.message).to.include("Пароль успешно изменен");
      expect(mockUserRepo.update.calledOnce).to.be.true;

      // Verify that the stored hash is a valid bcrypt hash
      const updateArgs = mockUserRepo.update.firstCall.args;

      expect(updateArgs[0]).to.equal(uuid());
      expect(updateArgs[1].passwordHash).to.match(/^\$2[aby]\$\d+\$/);
    });
  });

  describe("deleteUser", () => {
    it("should return true on successful deletion", async () => {
      mockUserRepo.delete.resolves({ affected: 1 });

      const result = await service.deleteUser(uuid());

      expect(result).to.be.true;
    });

    it("should return false when user not found", async () => {
      mockUserRepo.delete.resolves({ affected: 0 });

      const result = await service.deleteUser("nonexistent");

      expect(result).to.be.false;
    });
  });

  describe("setUsername", () => {
    it("should save valid username", async () => {
      mockUserRepo.findByUsername.resolves(null);
      mockUserRepo.findOne.resolves({ ...fakeUser, username: "newuser" });

      const result = await service.setUsername(uuid(), "newuser");

      expect(result).to.exist;
      expect(mockUserRepo.update.calledOnce).to.be.true;
    });

    it("should throw BadRequestException for invalid username format", async () => {
      try {
        await service.setUsername(uuid(), "AB"); // too short, uppercase
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("5-32 символа");
      }
    });

    it("should throw BadRequestException for username with special chars", async () => {
      try {
        await service.setUsername(uuid(), "user@name!");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("5-32 символа");
      }
    });

    it("should throw ConflictException for duplicate username", async () => {
      mockUserRepo.findByUsername.resolves({ id: uuid2(), username: "taken_name" });

      try {
        await service.setUsername(uuid(), "taken_name");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("уже занят");
      }
    });

    it("should allow setting same username for same user", async () => {
      mockUserRepo.findByUsername.resolves({ id: uuid(), username: "myuser" });
      mockUserRepo.findOne.resolves({ ...fakeUser, username: "myuser" });

      const result = await service.setUsername(uuid(), "myuser");

      expect(result).to.exist;
      expect(mockUserRepo.update.calledOnce).to.be.true;
    });
  });

  describe("searchUsers", () => {
    it("should call repository search with params", async () => {
      mockUserRepo.searchByQuery.resolves([[fakeUser], 1]);

      const result = await service.searchUsers("test", 20, 0);

      expect(result).to.deep.equal([[fakeUser], 1]);
      expect(mockUserRepo.searchByQuery.calledWith("test", 20, 0)).to.be.true;
    });

    it("should use default limit and offset", async () => {
      mockUserRepo.searchByQuery.resolves([[], 0]);

      await service.searchUsers("query");

      expect(mockUserRepo.searchByQuery.calledWith("query", 20, 0)).to.be.true;
    });
  });

  describe("getUserByUsername", () => {
    it("should return user when found", async () => {
      mockUserRepo.findByUsername.resolves(fakeUser);

      const result = await service.getUserByUsername("testuser");

      expect(result).to.deep.equal(fakeUser);
    });

    it("should throw NotFoundException when not found", async () => {
      mockUserRepo.findByUsername.resolves(null);

      try {
        await service.getUserByUsername("nonexistent");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Пользователь не найден");
      }
    });
  });
});
