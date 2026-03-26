import "reflect-metadata";

import { expect } from "chai";

import { CreateContactSchema } from "./create-contact.validate";

const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("Contact Validation Schemas", () => {
  describe("CreateContactSchema", () => {
    it("should accept valid contactUserId", () => {
      const result = CreateContactSchema.safeParse({
        contactUserId: validUuid,
      });

      expect(result.success).to.be.true;
    });

    it("should accept with optional displayName", () => {
      const result = CreateContactSchema.safeParse({
        contactUserId: validUuid,
        displayName: "John",
      });

      expect(result.success).to.be.true;
    });

    it("should reject invalid UUID", () => {
      const result = CreateContactSchema.safeParse({
        contactUserId: "not-uuid",
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing contactUserId", () => {
      const result = CreateContactSchema.safeParse({});

      expect(result.success).to.be.false;
    });

    it("should reject displayName exceeding 80 chars", () => {
      const result = CreateContactSchema.safeParse({
        contactUserId: validUuid,
        displayName: "a".repeat(81),
      });

      expect(result.success).to.be.false;
    });
  });
});
