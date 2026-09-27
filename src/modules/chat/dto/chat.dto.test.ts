import "reflect-metadata";

import { expect } from "chai";

import { type IFileDto, NO_SIGNED_FILES } from "../../file";
import { EChatMemberRole, EChatType } from "../chat.types";
import {
  ChatDto,
  ChatMemberDto,
  ChatMemberPublicDto,
  collectChatFiles,
} from "./chat.dto";

const signed = (id: string) =>
  new Map([[id, { id, url: `https://s3/${id}?sig` } as IFileDto]]);

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
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.id).to.equal("chat-1");
    expect(dto.type).to.equal(EChatType.GROUP);
    expect(dto.name).to.equal("Test Chat");
    expect(dto.description).to.equal("A test chat");
    expect(dto.isPublic).to.be.false;
    expect(dto.createdById).to.equal("user-1");
    expect(dto.createdAt).to.deep.equal(new Date("2025-01-01"));
    expect(dto.updatedAt).to.deep.equal(new Date("2025-01-02"));
  });

  it("members mapped via ChatMemberPublicDto.fromEntity", () => {
    const entity = createChatEntity({
      members: [
        createMemberEntity({ id: "m1", userId: "u1" }),
        createMemberEntity({ id: "m2", userId: "u2" }),
      ],
    });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.members).to.have.length(2);
    expect(dto.members[0]).to.be.instanceOf(ChatMemberPublicDto);
    expect(dto.members[0].userId).to.equal("u1");
    expect(dto.members[1].userId).to.equal("u2");
  });

  it("members не раскрывают приватные настройки участников", () => {
    const entity = createChatEntity({
      members: [
        createMemberEntity({
          id: "m1",
          userId: "u1",
          mutedUntil: new Date("2030-01-01"),
          lastReadMessageId: "msg-1",
          isPinnedChat: true,
          pinnedChatAt: new Date("2025-01-01"),
          folderId: "folder-1",
        }),
        createMemberEntity({ id: "m2", userId: "u2" }),
      ],
    });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES, "u2");

    for (const member of dto.members) {
      expect(member).to.not.have.any.keys(
        "mutedUntil",
        "lastReadMessageId",
        "isPinnedChat",
        "pinnedChatAt",
        "folderId",
      );
    }
    expect(dto.me).to.be.instanceOf(ChatMemberDto);
    expect(dto.me!.userId).to.equal("u2");
    expect(dto.me).to.have.property("folderId", null);
  });

  it("membersCount и превью участников из опций", () => {
    const entity = createChatEntity({
      members: [createMemberEntity({ id: "me", userId: "u1", folderId: "f" })],
    });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES, "u1", {
      members: [
        createMemberEntity({ id: "p1", userId: "u1" }),
        createMemberEntity({ id: "p2", userId: "u2" }),
      ],
      membersCount: 42,
    });

    expect(dto.membersCount).to.equal(42);
    expect(dto.members.map(m => m.userId)).to.deep.equal(["u1", "u2"]);
    expect(dto.me!.folderId).to.equal("f");
  });

  it("empty members returns empty array", () => {
    const entity = createChatEntity({ members: [] });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.members).to.deep.equal([]);
  });

  it("undefined members returns empty array", () => {
    const entity = createChatEntity({ members: undefined });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.members).to.deep.equal([]);
  });

  it("avatarUrl — из карты подписей", () => {
    const entity = createChatEntity({ avatar: { id: "f-1" } });
    const dto = ChatDto.fromEntity(entity, signed("f-1"));

    expect(dto.avatarUrl).to.equal("https://s3/f-1?sig");
  });

  it("аватар без подписи в карте — null (синхронной подписи нет)", () => {
    const entity = createChatEntity({ avatar: { id: "f-1" } });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.avatarUrl).to.be.null;
  });

  it("аватары участников — из карты подписей", () => {
    const member = createMemberEntity({
      user: { profile: { id: "p-1", userId: "user-1", avatar: { id: "a-1" } } },
    });
    const entity = createChatEntity({ members: [member] });
    const dto = ChatDto.fromEntity(entity, signed("a-1"), "user-1");

    expect(dto.members[0].profile!.avatarUrl).to.equal("https://s3/a-1?sig");
    expect(dto.me!.profile!.avatarUrl).to.equal("https://s3/a-1?sig");
  });

  it("collectChatFiles: аватар чата, участников и переданных отдельно", () => {
    const entity = createChatEntity({
      avatar: { id: "c-1" },
      members: [
        createMemberEntity({ user: { profile: { avatar: { id: "a-1" } } } }),
      ],
    });
    const extra = createMemberEntity({
      user: { profile: { avatar: { id: "a-2" } } },
    });

    expect(
      collectChatFiles([entity], [extra, null])
        .filter(Boolean)
        .map(f => f!.id),
    ).to.deep.equal(["c-1", "a-1", "a-2"]);
  });

  it("null avatar returns null avatarUrl", () => {
    const entity = createChatEntity({ avatar: null });
    const dto = ChatDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.avatarUrl).to.be.null;
  });
});

describe("ChatMemberDto", () => {
  it("fields mapped correctly", () => {
    const entity = createMemberEntity({
      isPinnedChat: true,
      folderId: "folder-1",
    });
    const dto = ChatMemberDto.fromEntity(entity, NO_SIGNED_FILES);

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
    const dto = ChatMemberDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.profile).to.not.be.undefined;
    expect(dto.profile!.firstName).to.equal("Alice");
  });

  it("profile undefined when no user", () => {
    const entity = createMemberEntity({ user: null });
    const dto = ChatMemberDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.profile).to.be.undefined;
  });
});
