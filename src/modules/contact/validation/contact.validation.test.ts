import "reflect-metadata";

import { expect } from "chai";

import { CreateContactSchema } from "./create-contact.validate";
import { GetContactsQuerySchema } from "./get-contacts.validate";

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

  describe("GetContactsQuerySchema", () => {
    it("принимает допустимый статус и его отсутствие", () => {
      expect(GetContactsQuerySchema.safeParse({ status: "blocked" }).success).to
        .be.true;
      expect(GetContactsQuerySchema.safeParse({}).success).to.be.true;
    });

    it("отклоняет неизвестный статус", () => {
      expect(GetContactsQuerySchema.safeParse({ status: "weird" }).success).to
        .be.false;
    });

    it("сохраняет offset/limit (иначе схема выбросила бы их из query)", () => {
      const result = GetContactsQuerySchema.safeParse({
        offset: "40",
        limit: "20",
      });

      expect(result.success && result.data).to.deep.equal({
        offset: 40,
        limit: 20,
      });
    });

    it("limit больше 100 — ошибка", () => {
      expect(GetContactsQuerySchema.safeParse({ limit: "500" }).success).to.be
        .false;
    });
  });
});
