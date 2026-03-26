import "reflect-metadata";

import { expect } from "chai";

import { CreateBotSchema } from "./create-bot.validate";
import { SetCommandsSchema } from "./set-commands.validate";
import { SetWebhookSchema } from "./set-webhook.validate";

describe("Bot Validation Schemas", () => {
  describe("CreateBotSchema", () => {
    it("should accept valid data", () => {
      const result = CreateBotSchema.safeParse({
        username: "my_bot_1",
        displayName: "My Bot",
      });

      expect(result.success).to.be.true;
    });

    it("should accept with optional description", () => {
      const result = CreateBotSchema.safeParse({
        username: "my_bot_1",
        displayName: "My Bot",
        description: "A helpful bot",
      });

      expect(result.success).to.be.true;
    });

    it("should reject username shorter than 3 chars", () => {
      const result = CreateBotSchema.safeParse({
        username: "ab",
        displayName: "Bot",
      });

      expect(result.success).to.be.false;
    });

    it("should reject username longer than 50 chars", () => {
      const result = CreateBotSchema.safeParse({
        username: "a".repeat(51),
        displayName: "Bot",
      });

      expect(result.success).to.be.false;
    });

    it("should reject username with special chars", () => {
      const result = CreateBotSchema.safeParse({
        username: "my-bot!",
        displayName: "Bot",
      });

      expect(result.success).to.be.false;
    });

    it("should reject empty displayName", () => {
      const result = CreateBotSchema.safeParse({
        username: "my_bot",
        displayName: "",
      });

      expect(result.success).to.be.false;
    });

    it("should reject displayName exceeding 100 chars", () => {
      const result = CreateBotSchema.safeParse({
        username: "my_bot",
        displayName: "a".repeat(101),
      });

      expect(result.success).to.be.false;
    });

    it("should reject description exceeding 500 chars", () => {
      const result = CreateBotSchema.safeParse({
        username: "my_bot",
        displayName: "Bot",
        description: "a".repeat(501),
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing required fields", () => {
      const result = CreateBotSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("SetWebhookSchema", () => {
    it("should accept valid URL", () => {
      const result = SetWebhookSchema.safeParse({
        url: "https://example.com/webhook",
      });

      expect(result.success).to.be.true;
    });

    it("should accept with optional secret", () => {
      const result = SetWebhookSchema.safeParse({
        url: "https://example.com/webhook",
        secret: "my-secret",
      });

      expect(result.success).to.be.true;
    });

    it("should reject invalid URL", () => {
      const result = SetWebhookSchema.safeParse({ url: "not-a-url" });

      expect(result.success).to.be.false;
    });

    it("should reject URL exceeding 500 chars", () => {
      const result = SetWebhookSchema.safeParse({
        url: "https://example.com/" + "a".repeat(500),
      });

      expect(result.success).to.be.false;
    });

    it("should reject secret exceeding 100 chars", () => {
      const result = SetWebhookSchema.safeParse({
        url: "https://example.com/webhook",
        secret: "a".repeat(101),
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing url", () => {
      const result = SetWebhookSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("SetCommandsSchema", () => {
    it("should accept valid commands", () => {
      const result = SetCommandsSchema.safeParse({
        commands: [{ command: "help", description: "Show help" }],
      });

      expect(result.success).to.be.true;
    });

    it("should accept empty commands array", () => {
      const result = SetCommandsSchema.safeParse({ commands: [] });

      expect(result.success).to.be.true;
    });

    it("should reject more than 50 commands", () => {
      const commands = Array(51)
        .fill(null)
        .map((_, i) => ({ command: `cmd${i}`, description: "desc" }));

      const result = SetCommandsSchema.safeParse({ commands });

      expect(result.success).to.be.false;
    });

    it("should reject empty command name", () => {
      const result = SetCommandsSchema.safeParse({
        commands: [{ command: "", description: "desc" }],
      });

      expect(result.success).to.be.false;
    });

    it("should reject empty command description", () => {
      const result = SetCommandsSchema.safeParse({
        commands: [{ command: "help", description: "" }],
      });

      expect(result.success).to.be.false;
    });

    it("should reject command exceeding 50 chars", () => {
      const result = SetCommandsSchema.safeParse({
        commands: [{ command: "a".repeat(51), description: "desc" }],
      });

      expect(result.success).to.be.false;
    });

    it("should reject description exceeding 200 chars", () => {
      const result = SetCommandsSchema.safeParse({
        commands: [{ command: "help", description: "a".repeat(201) }],
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing commands field", () => {
      const result = SetCommandsSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });
});
