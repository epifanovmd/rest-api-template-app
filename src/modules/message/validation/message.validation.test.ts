import "reflect-metadata";

import { expect } from "chai";

import { EMessageType } from "../message.types";
import { EditMessageSchema } from "./edit-message.validate";
import { GetMessagesQuerySchema } from "./get-messages.validate";
import { MarkReadSchema } from "./mark-read.validate";
import {
  SocketMessageDeliveredSchema,
  SocketMessageReadSchema,
} from "./message-socket.validate";
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

    it("клиент не может прислать служебный тип SYSTEM/POLL", () => {
      for (const type of [EMessageType.SYSTEM, EMessageType.POLL]) {
        const result = SendMessageSchema.safeParse({ type, content: "x" });

        expect(result.success, type).to.be.false;
      }
    });

    it("пользовательские типы разрешены", () => {
      for (const type of [
        EMessageType.TEXT,
        EMessageType.IMAGE,
        EMessageType.FILE,
        EMessageType.VOICE,
      ]) {
        const result = SendMessageSchema.safeParse({ type, content: "x" });

        expect(result.success, type).to.be.true;
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
      const result = MarkReadSchema.safeParse({ messageIds: [validUuid] });

      expect(result.success).to.be.true;
    });

    it("should reject invalid UUID", () => {
      const result = MarkReadSchema.safeParse({ messageIds: ["not-uuid"] });

      expect(result.success).to.be.false;
    });

    it("should reject empty list", () => {
      const result = MarkReadSchema.safeParse({ messageIds: [] });

      expect(result.success).to.be.false;
    });

    it("should reject missing messageIds", () => {
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

  describe("GetMessagesQuerySchema", () => {
    it("limit из строки query приводится к числу", () => {
      const result = GetMessagesQuerySchema.safeParse({ limit: "30" });

      expect(result.success && result.data.limit).to.equal(30);
    });

    it("limit больше 100 — ошибка", () => {
      expect(GetMessagesQuerySchema.safeParse({ limit: "101" }).success).to.be
        .false;
    });

    it("cursor и around вместе — ошибка", () => {
      const result = GetMessagesQuerySchema.safeParse({
        cursor: "abc",
        around: validUuid,
      });

      expect(result.success).to.be.false;
    });

    it("around — только UUID", () => {
      expect(GetMessagesQuerySchema.safeParse({ around: "m-1" }).success).to.be
        .false;
    });
  });

  describe("сокет-события", () => {
    it("message:read: messageId старого формата → messageIds", () => {
      const result = SocketMessageReadSchema.safeParse({
        chatId: validUuid,
        messageId: validUuid,
      });

      expect(result.success && result.data).to.deep.equal({
        chatId: validUuid,
        messageIds: [validUuid],
      });
    });

    it("message:delivered: messageIds обязательны", () => {
      expect(
        SocketMessageDeliveredSchema.safeParse({ chatId: validUuid }).success,
      ).to.be.false;
    });
  });
});
