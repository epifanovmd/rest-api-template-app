import "reflect-metadata";

import { expect } from "chai";

import { EMessageType } from "../../message";
import {
  BOT_MESSAGE_MAX_LENGTH,
  BotEditMessageSchema,
  BotSendMessageSchema,
} from "./bot-message.validate";

describe("Bot message schemas", () => {
  const chatId = "00000000-0000-4000-8000-000000000001";

  it("принимает текстовое сообщение и подставляет type = TEXT", () => {
    const result = BotSendMessageSchema.safeParse({ chatId, content: "hi" });

    expect(result.success).to.be.true;
    expect(result.data!.type).to.equal(EMessageType.TEXT);
  });

  it("отклоняет не-TEXT тип", () => {
    const result = BotSendMessageSchema.safeParse({
      chatId,
      content: "hi",
      type: EMessageType.IMAGE,
    });

    expect(result.success).to.be.false;
  });

  it("отклоняет пустой и слишком длинный текст", () => {
    expect(BotSendMessageSchema.safeParse({ chatId, content: "  " }).success).to
      .be.false;
    expect(
      BotSendMessageSchema.safeParse({
        chatId,
        content: "x".repeat(BOT_MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).to.be.false;
  });

  it("отклоняет некорректный chatId", () => {
    expect(
      BotSendMessageSchema.safeParse({ chatId: "x", content: "hi" }).success,
    ).to.be.false;
  });

  it("отбрасывает fileIds и прочие поля", () => {
    const result = BotSendMessageSchema.safeParse({
      chatId,
      content: "hi",
      fileIds: ["a"],
    });

    expect(result.success).to.be.true;
    expect(result.data).to.not.have.property("fileIds");
  });

  it("edit: проверяет длину", () => {
    expect(BotEditMessageSchema.safeParse({ content: "ok" }).success).to.be
      .true;
    expect(
      BotEditMessageSchema.safeParse({
        content: "x".repeat(BOT_MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).to.be.false;
  });
});
