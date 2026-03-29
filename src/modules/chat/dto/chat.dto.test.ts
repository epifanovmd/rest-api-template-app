import "reflect-metadata";

import { expect } from "chai";

import { EChatMemberRole, EChatType } from "../chat.types";
import { ChatDto, ChatMemberDto } from "./chat.dto";

const createMemberEntity = (overrides: Record<string, any> = {}) =>
  ({
    id: "member-1",
    userId: "user-1",
    role: EChatMemberRole.MEMBER,
    joinedAt: new Date("2025-01-01"),
    mutedUntil: null,
    isPinnedChat: false,
    folderId: null,
    user: null,
    ...overrides,
  }) as any;

const createChatEntity = (overrides: Record<string, any> = {}) =>
  ({
    id: "chat-1",
    type: EChatType.GROUP,
    name: "Test Chat",
    description: "A test chat",
    username: null,
    isPublic: false,
    avatar: null,
    createdById: "user-1",
    lastMessageAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    members: [],
    ...overrides,
  }) as any;

describe("ChatDto", () => {
  it("basic mapping", () => {
    const entity = createChatEntity();
    const dto = ChatDto.fromEntity(entity);

    expect(dto.id).to.equal("chat-1");
    expect(dto.type).to.equal(EChatType.GROUP);
    expect(dto.name).to.equal("Test Chat");
    expect(dto.description).to.equal("A test chat");
    expect(dto.isPublic).to.be.false;
    expect(dto.createdById).to.equal("user-1");
    expect(dto.createdAt).to.deep.equal(new Date("2025-01-01"));
    expect(dto.updatedAt).to.deep.equal(new Date("2025-01-02"));
  });

  it("members mapped via ChatMemberDto.fromEntity", () => {
    const entity = createChatEntity({
      members: [
        createMemberEntity({ id: "m1", userId: "u1" }),
        createMemberEntity({ id: "m2", userId: "u2" }),
      ],
    });
    const dto = ChatDto.fromEntity(entity);

    expect(dto.members).to.have.length(2);
    expect(dto.members[0]).to.be.instanceOf(ChatMemberDto);
    expect(dto.members[0].userId).to.equal("u1");
    expect(dto.members[1].userId).to.equal("u2");
  });

  it("empty members returns empty array", () => {
    const entity = createChatEntity({ members: [] });
    const dto = ChatDto.fromEntity(entity);

    expect(dto.members).to.deep.equal([]);
  });

  it("undefined members returns empty array", () => {
    const entity = createChatEntity({ members: undefined });
    const dto = ChatDto.fromEntity(entity);

    expect(dto.members).to.deep.equal([]);
  });

  it("avatar url extraction", () => {
    const entity = createChatEntity({
      avatar: { url: "https://cdn/chat-avatar.jpg" },
    });
    const dto = ChatDto.fromEntity(entity);

    expect(dto.avatarUrl).to.equal("https://cdn/chat-avatar.jpg");
  });

  it("null avatar returns null avatarUrl", () => {
    const entity = createChatEntity({ avatar: null });
    const dto = ChatDto.fromEntity(entity);

    expect(dto.avatarUrl).to.be.null;
  });
});

describe("ChatMemberDto", () => {
  it("fields mapped correctly", () => {
    const entity = createMemberEntity({
      isPinnedChat: true,
      folderId: "folder-1",
    });
    const dto = ChatMemberDto.fromEntity(entity);

    expect(dto.id).to.equal("member-1");
    expect(dto.userId).to.equal("user-1");
    expect(dto.role).to.equal(EChatMemberRole.MEMBER);
    expect(dto.isPinnedChat).to.be.true;
    expect(dto.folderId).to.equal("folder-1");
  });

  it("profile mapped when user.profile present", () => {
    const entity = createMemberEntity({
      user: {
        profile: {
          id: "profile-1",
          firstName: "Alice",
          lastName: "Smith",
          status: "online",
          lastOnline: new Date("2025-06-01"),
        },
      },
    });
    const dto = ChatMemberDto.fromEntity(entity);

    expect(dto.profile).to.not.be.undefined;
    expect(dto.profile!.firstName).to.equal("Alice");
  });

  it("profile undefined when no user", () => {
    const entity = createMemberEntity({ user: null });
    const dto = ChatMemberDto.fromEntity(entity);

    expect(dto.profile).to.be.undefined;
  });
});
