import "reflect-metadata";

import { expect } from "chai";

import { EMessageStatus, EMessageType } from "../message.types";
import { MessageAttachmentDto, MessageDto } from "./message.dto";

const createEntity = (overrides: Record<string, any> = {}) =>
  ({
    id: "msg-1",
    chatId: "chat-1",
    senderId: "user-1",
    type: EMessageType.TEXT,
    status: EMessageStatus.SENT,
    content: "Hello world",
    replyToId: null,
    forwardedFromId: null,
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    pinnedAt: null,
    pinnedById: null,
    encryptedContent: null,
    encryptionMetadata: null,
    keyboard: null,
    linkPreviews: null,
    selfDestructSeconds: null,
    selfDestructAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    sender: null,
    replyTo: null,
    attachments: [],
    reactions: [],
    mentions: [],
    ...overrides,
  } as any);

describe("MessageDto", () => {
  it("basic fields mapped correctly", () => {
    const entity = createEntity();
    const dto = MessageDto.fromEntity(entity);

    expect(dto.id).to.equal("msg-1");
    expect(dto.chatId).to.equal("chat-1");
    expect(dto.senderId).to.equal("user-1");
    expect(dto.type).to.equal(EMessageType.TEXT);
    expect(dto.status).to.equal(EMessageStatus.SENT);
    expect(dto.content).to.equal("Hello world");
    expect(dto.isEdited).to.be.false;
    expect(dto.isDeleted).to.be.false;
    expect(dto.createdAt).to.deep.equal(new Date("2025-01-01"));
    expect(dto.updatedAt).to.deep.equal(new Date("2025-01-02"));
  });

  it("isDeleted sets content to null", () => {
    const entity = createEntity({ isDeleted: true, content: "secret" });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.content).to.be.null;
  });

  it("reactions aggregated by emoji with counts and userIds", () => {
    const entity = createEntity({
      reactions: [
        { emoji: "thumbsup", userId: "u1" },
        { emoji: "thumbsup", userId: "u2" },
        { emoji: "heart", userId: "u3" },
      ],
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.reactions).to.have.length(2);

    const thumbsup = dto.reactions.find(r => r.emoji === "thumbsup");

    expect(thumbsup!.count).to.equal(2);
    expect(thumbsup!.userIds).to.deep.equal(["u1", "u2"]);

    const heart = dto.reactions.find(r => r.emoji === "heart");

    expect(heart!.count).to.equal(1);
    expect(heart!.userIds).to.deep.equal(["u3"]);
  });

  it("empty reactions returns empty array", () => {
    const entity = createEntity({ reactions: [] });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.reactions).to.deep.equal([]);
  });

  it("null reactions returns empty array", () => {
    const entity = createEntity({ reactions: null });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.reactions).to.deep.equal([]);
  });

  it("multiple users same emoji are grouped", () => {
    const entity = createEntity({
      reactions: [
        { emoji: "fire", userId: "a" },
        { emoji: "fire", userId: "b" },
        { emoji: "fire", userId: "c" },
      ],
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.reactions).to.have.length(1);
    expect(dto.reactions[0].count).to.equal(3);
    expect(dto.reactions[0].userIds).to.deep.equal(["a", "b", "c"]);
  });

  it("replyTo creates recursive MessageDto", () => {
    const replyEntity = createEntity({ id: "reply-1", content: "reply" });
    const entity = createEntity({ replyTo: replyEntity, replyToId: "reply-1" });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.replyTo).to.be.instanceOf(MessageDto);
    expect(dto.replyTo!.id).to.equal("reply-1");
    expect(dto.replyTo!.content).to.equal("reply");
  });

  it("replyTo null returns null", () => {
    const entity = createEntity({ replyTo: null });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.replyTo).to.be.null;
  });

  it("mentions mapped correctly", () => {
    const entity = createEntity({
      mentions: [
        { userId: "u1", isAll: false },
        { userId: null, isAll: true },
      ],
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.mentions).to.deep.equal([
      { userId: "u1", isAll: false },
      { userId: null, isAll: true },
    ]);
  });

  it("empty mentions returns empty array", () => {
    const entity = createEntity({ mentions: [] });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.mentions).to.deep.equal([]);
  });

  it("undefined mentions returns empty array", () => {
    const entity = createEntity({ mentions: undefined });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.mentions).to.deep.equal([]);
  });

  it("attachments mapped with thumbnail fields", () => {
    const entity = createEntity({
      attachments: [
        {
          id: "att-1",
          fileId: "f-1",
          file: {
            name: "photo.jpg",
            url: "https://cdn/photo.jpg",
            type: "image/jpeg",
            size: 1024,
            thumbnailUrl: "https://cdn/photo_thumb.jpg",
            width: 800,
            height: 600,
          },
        },
      ],
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.attachments).to.have.length(1);
    expect(dto.attachments[0]).to.be.instanceOf(MessageAttachmentDto);
    expect(dto.attachments[0].fileName).to.equal("photo.jpg");
    expect(dto.attachments[0].thumbnailUrl).to.equal(
      "https://cdn/photo_thumb.jpg",
    );
    expect(dto.attachments[0].width).to.equal(800);
    expect(dto.attachments[0].height).to.equal(600);
  });

  it("sender profile mapping", () => {
    const entity = createEntity({
      sender: {
        id: "user-1",
        profile: {
          firstName: "John",
          lastName: "Doe",
          avatar: { url: "https://cdn/avatar.jpg" },
        },
      },
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.sender).to.deep.equal({
      id: "user-1",
      firstName: "John",
      lastName: "Doe",
      avatarUrl: "https://cdn/avatar.jpg",
    });
  });

  it("missing sender leaves sender undefined", () => {
    const entity = createEntity({ sender: null });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.sender).to.be.undefined;
  });

  it("sender without profile has undefined fields", () => {
    const entity = createEntity({
      sender: { id: "user-1", profile: undefined },
    });
    const dto = MessageDto.fromEntity(entity);

    expect(dto.sender!.id).to.equal("user-1");
    expect(dto.sender!.firstName).to.be.undefined;
    expect(dto.sender!.lastName).to.be.undefined;
    expect(dto.sender!.avatarUrl).to.be.undefined;
  });
});
