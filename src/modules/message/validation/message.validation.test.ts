import "reflect-metadata";

import { expect } from "chai";

import { EMessageType } from "../message.types";
import { EditMessageSchema } from "./edit-message.validate";
import { MarkReadSchema } from "./mark-read.validate";
import { AddReactionSchema } from "./reaction.validate";
import { SendMessageSchema } from "./send-message.validate";

const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("Message Validation Schemas", () => {
  describe("SendMessageSchema", () => {
    it("should accept valid text message", () => {
      const result = SendMessageSchema.safeParse({ content: "Hello!" });

      expect(result.success).to.be.true;
    });

    it("should apply default type TEXT", () => {
      const result = SendMessageSchema.safeParse({ content: "Hello" });

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.type).to.equal(EMessageType.TEXT);
      }
    });

    it("should accept message with fileIds only", () => {
      const result = SendMessageSchema.safeParse({
        fileIds: [validUuid],
      });

      expect(result.success).to.be.true;
    });

    it("should reject when neither content nor fileIds", () => {
      const result = SendMessageSchema.safeParse({});

      expect(result.success).to.be.false;
    });

    it("should reject content exceeding 4000 chars", () => {
      const result = SendMessageSchema.safeParse({
        content: "a".repeat(4001),
      });

      expect(result.success).to.be.false;
    });

    it("should reject more than 10 fileIds", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        fileIds: Array(11).fill(validUuid),
      });

      expect(result.success).to.be.false;
    });

    it("should reject invalid UUID in replyToId", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        replyToId: "not-uuid",
      });

      expect(result.success).to.be.false;
    });

    it("should reject selfDestructSeconds below 1", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        selfDestructSeconds: 0,
      });

      expect(result.success).to.be.false;
    });

    it("should reject selfDestructSeconds above 604800", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        selfDestructSeconds: 604801,
      });

      expect(result.success).to.be.false;
    });

    it("should accept more than 50 mentionedUserIds as invalid", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        mentionedUserIds: Array(51).fill(validUuid),
      });

      expect(result.success).to.be.false;
    });

    it("should accept valid mentionAll boolean", () => {
      const result = SendMessageSchema.safeParse({
        content: "text",
        mentionAll: true,
      });

      expect(result.success).to.be.true;
    });
  });

  describe("EditMessageSchema", () => {
    it("should accept valid content", () => {
      const result = EditMessageSchema.safeParse({ content: "edited" });

      expect(result.success).to.be.true;
    });

    it("should reject empty content", () => {
      const result = EditMessageSchema.safeParse({ content: "" });

      expect(result.success).to.be.false;
    });

    it("should reject content exceeding 4000 chars", () => {
      const result = EditMessageSchema.safeParse({
        content: "a".repeat(4001),
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing content", () => {
      const result = EditMessageSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("MarkReadSchema", () => {
    it("should accept valid UUID", () => {
      const result = MarkReadSchema.safeParse({ messageId: validUuid });

      expect(result.success).to.be.true;
    });

    it("should reject invalid UUID", () => {
      const result = MarkReadSchema.safeParse({ messageId: "not-uuid" });

      expect(result.success).to.be.false;
    });

    it("should reject missing messageId", () => {
      const result = MarkReadSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("AddReactionSchema", () => {
    it("should accept valid emoji", () => {
      const result = AddReactionSchema.safeParse({ emoji: "thumbsup" });

      expect(result.success).to.be.true;
    });

    it("should reject empty emoji", () => {
      const result = AddReactionSchema.safeParse({ emoji: "" });

      expect(result.success).to.be.false;
    });

    it("should reject emoji exceeding 20 chars", () => {
      const result = AddReactionSchema.safeParse({
        emoji: "a".repeat(21),
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing emoji", () => {
      const result = AddReactionSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });
});
