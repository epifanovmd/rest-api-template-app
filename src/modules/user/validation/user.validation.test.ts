import "reflect-metadata";

import { expect } from "chai";

import { Roles } from "../../role/role.types";
import { SetUsernameSchema } from "./set-username.validate";
import { ChangePasswordSchema } from "./user-change-password.validate";
import { SetPrivilegesSchema } from "./user-privileges.validate";
import { UserUpdateSchema } from "./user-update.validate";

const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("User Validation Schemas", () => {
  describe("SetUsernameSchema", () => {
    it("should accept valid username", () => {
      const result = SetUsernameSchema.safeParse({ username: "john_doe_1" });

      expect(result.success).to.be.true;
    });

    it("should transform to lowercase", () => {
      const result = SetUsernameSchema.safeParse({ username: "john_doe_1" });

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.username).to.equal("john_doe_1");
      }
    });

    it("should reject username shorter than 5 chars", () => {
      const result = SetUsernameSchema.safeParse({ username: "ab" });

      expect(result.success).to.be.false;
    });

    it("should reject username longer than 32 chars", () => {
      const result = SetUsernameSchema.safeParse({
        username: "a".repeat(33),
      });

      expect(result.success).to.be.false;
    });

    it("should reject uppercase letters", () => {
      const result = SetUsernameSchema.safeParse({ username: "JohnDoe" });

      expect(result.success).to.be.false;
    });

    it("should reject special characters", () => {
      const result = SetUsernameSchema.safeParse({ username: "john-doe!" });

      expect(result.success).to.be.false;
    });
  });

  describe("ChangePasswordSchema", () => {
    it("should accept valid password", () => {
      const result = ChangePasswordSchema.safeParse({
        password: "newpassword",
      });

      expect(result.success).to.be.true;
    });

    it("should reject short password", () => {
      const result = ChangePasswordSchema.safeParse({ password: "12345" });

      expect(result.success).to.be.false;
    });

    it("should reject password exceeding 100 chars", () => {
      const result = ChangePasswordSchema.safeParse({
        password: "a".repeat(101),
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing password", () => {
      const result = ChangePasswordSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("UserUpdateSchema", () => {
    it("should accept valid email", () => {
      const result = UserUpdateSchema.safeParse({ email: "new@test.com" });

      expect(result.success).to.be.true;
    });

    it("should accept valid phone", () => {
      const result = UserUpdateSchema.safeParse({ phone: "+71234567890" });

      expect(result.success).to.be.true;
    });

    it("should accept valid roleId", () => {
      const result = UserUpdateSchema.safeParse({ roleId: validUuid });

      expect(result.success).to.be.true;
    });

    it("should reject when no fields provided", () => {
      const result = UserUpdateSchema.safeParse({});

      expect(result.success).to.be.false;
    });

    it("should reject invalid email format", () => {
      const result = UserUpdateSchema.safeParse({ email: "not-email" });

      expect(result.success).to.be.false;
    });

    it("should reject invalid phone format", () => {
      const result = UserUpdateSchema.safeParse({ phone: "12345" });

      expect(result.success).to.be.false;
    });

    it("should transform email to lowercase", () => {
      const result = UserUpdateSchema.safeParse({ email: "TEST@Test.COM" });

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.email).to.equal("test@test.com");
      }
    });

    it("should reject email exceeding 50 chars", () => {
      const result = UserUpdateSchema.safeParse({
        email: "a".repeat(45) + "@b.com",
      });

      expect(result.success).to.be.false;
    });
  });

  describe("SetPrivilegesSchema", () => {
    it("should accept valid roles and permissions", () => {
      const result = SetPrivilegesSchema.safeParse({
        roles: [Roles.USER],
      });

      expect(result.success).to.be.true;
    });

    it("should apply default empty permissions", () => {
      const result = SetPrivilegesSchema.safeParse({
        roles: [Roles.USER],
      });

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.permissions).to.deep.equal([]);
      }
    });

    it("should reject empty roles array", () => {
      const result = SetPrivilegesSchema.safeParse({ roles: [] });

      expect(result.success).to.be.false;
    });

    it("should accept any non-empty string as role", () => {
      const result = SetPrivilegesSchema.safeParse({
        roles: ["custom-role"],
      });

      expect(result.success).to.be.true;
    });

    it("should reject empty string as role", () => {
      const result = SetPrivilegesSchema.safeParse({
        roles: [""],
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing roles", () => {
      const result = SetPrivilegesSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });
});
