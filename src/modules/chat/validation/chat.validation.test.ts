import "reflect-metadata";

import { expect } from "chai";

import { EChatMemberRole } from "../chat.types";
import { AddMembersSchema } from "./add-members.validate";
import { CreateChannelSchema } from "./create-channel.validate";
import { CreateDirectChatSchema } from "./create-direct-chat.validate";
import { CreateFolderSchema } from "./create-folder.validate";
import { CreateGroupChatSchema } from "./create-group-chat.validate";
import { CreateInviteSchema } from "./create-invite.validate";
import { MoveChatToFolderSchema } from "./move-chat-to-folder.validate";
import { MuteChatSchema } from "./mute-chat.validate";
import { UpdateChannelSchema } from "./update-channel.validate";
import { UpdateChatSchema } from "./update-chat.validate";
import { UpdateMemberRoleSchema } from "./update-member-role.validate";

const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("Chat Validation Schemas", () => {
  describe("CreateDirectChatSchema", () => {
    it("should accept valid UUID", () => {
      const result = CreateDirectChatSchema.safeParse({
        targetUserId: validUuid,
      });

      expect(result.success).to.be.true;
    });

    it("should reject invalid UUID", () => {
      const result = CreateDirectChatSchema.safeParse({
        targetUserId: "not-a-uuid",
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing targetUserId", () => {
      const result = CreateDirectChatSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("CreateGroupChatSchema", () => {
    it("should accept valid data", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "My Group",
        memberIds: [validUuid],
      });

      expect(result.success).to.be.true;
    });

    it("should reject empty name", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "",
        memberIds: [validUuid],
      });

      expect(result.success).to.be.false;
    });

    it("should reject name exceeding 100 chars", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "a".repeat(101),
        memberIds: [validUuid],
      });

      expect(result.success).to.be.false;
    });

    it("should reject empty memberIds array", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "Group",
        memberIds: [],
      });

      expect(result.success).to.be.false;
    });

    it("should reject invalid UUIDs in memberIds", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "Group",
        memberIds: ["not-a-uuid"],
      });

      expect(result.success).to.be.false;
    });

    it("should accept optional avatarId", () => {
      const result = CreateGroupChatSchema.safeParse({
        name: "Group",
        memberIds: [validUuid],
        avatarId: validUuid,
      });

      expect(result.success).to.be.true;
    });
  });

  describe("CreateChannelSchema", () => {
    it("should accept valid data", () => {
      const result = CreateChannelSchema.safeParse({ name: "My Channel" });

      expect(result.success).to.be.true;
    });

    it("should apply default isPublic=false", () => {
      const result = CreateChannelSchema.safeParse({ name: "Channel" });

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.isPublic).to.be.false;
      }
    });

    it("should reject empty name", () => {
      const result = CreateChannelSchema.safeParse({ name: "" });

      expect(result.success).to.be.false;
    });

    it("should reject name exceeding 100 chars", () => {
      const result = CreateChannelSchema.safeParse({
        name: "a".repeat(101),
      });

      expect(result.success).to.be.false;
    });

    it("should accept valid username", () => {
      const result = CreateChannelSchema.safeParse({
        name: "Channel",
        username: "my_channel_1",
      });

      expect(result.success).to.be.true;
    });

    it("should reject invalid username format", () => {
      const result = CreateChannelSchema.safeParse({
        name: "Channel",
        username: "ab", // too short
      });

      expect(result.success).to.be.false;
    });

    it("should reject username with special chars", () => {
      const result = CreateChannelSchema.safeParse({
        name: "Channel",
        username: "my-channel!",
      });

      expect(result.success).to.be.false;
    });

    it("should accept optional description", () => {
      const result = CreateChannelSchema.safeParse({
        name: "Channel",
        description: "A great channel",
      });

      expect(result.success).to.be.true;
    });

    it("should reject description exceeding 500 chars", () => {
      const result = CreateChannelSchema.safeParse({
        name: "Channel",
        description: "a".repeat(501),
      });

      expect(result.success).to.be.false;
    });
  });

  describe("UpdateChannelSchema", () => {
    it("should accept valid partial update", () => {
      const result = UpdateChannelSchema.safeParse({ name: "New Name" });

      expect(result.success).to.be.true;
    });

    it("should accept nullable fields", () => {
      const result = UpdateChannelSchema.safeParse({
        description: null,
        username: null,
        avatarId: null,
      });

      expect(result.success).to.be.true;
    });

    it("should accept empty object", () => {
      const result = UpdateChannelSchema.safeParse({});

      expect(result.success).to.be.true;
    });

    it("should reject invalid username", () => {
      const result = UpdateChannelSchema.safeParse({ username: "a" });

      expect(result.success).to.be.false;
    });
  });

  describe("UpdateChatSchema", () => {
    it("should accept valid name", () => {
      const result = UpdateChatSchema.safeParse({ name: "New Name" });

      expect(result.success).to.be.true;
    });

    it("should accept nullable avatarId", () => {
      const result = UpdateChatSchema.safeParse({ avatarId: null });

      expect(result.success).to.be.true;
    });

    it("should reject empty name", () => {
      const result = UpdateChatSchema.safeParse({ name: "" });

      expect(result.success).to.be.false;
    });

    it("should reject name exceeding 100 chars", () => {
      const result = UpdateChatSchema.safeParse({ name: "a".repeat(101) });

      expect(result.success).to.be.false;
    });

    it("should reject invalid avatarId UUID", () => {
      const result = UpdateChatSchema.safeParse({ avatarId: "not-uuid" });

      expect(result.success).to.be.false;
    });
  });

  describe("AddMembersSchema", () => {
    it("should accept valid memberIds", () => {
      const result = AddMembersSchema.safeParse({
        memberIds: [validUuid],
      });

      expect(result.success).to.be.true;
    });

    it("should reject empty memberIds", () => {
      const result = AddMembersSchema.safeParse({ memberIds: [] });

      expect(result.success).to.be.false;
    });

    it("should reject invalid UUIDs", () => {
      const result = AddMembersSchema.safeParse({ memberIds: ["bad"] });

      expect(result.success).to.be.false;
    });
  });

  describe("UpdateMemberRoleSchema", () => {
    it("should accept valid role", () => {
      const result = UpdateMemberRoleSchema.safeParse({
        role: EChatMemberRole.ADMIN,
      });

      expect(result.success).to.be.true;
    });

    it("should reject invalid role", () => {
      const result = UpdateMemberRoleSchema.safeParse({
        role: "superadmin",
      });

      expect(result.success).to.be.false;
    });

    it("should reject missing role", () => {
      const result = UpdateMemberRoleSchema.safeParse({});

      expect(result.success).to.be.false;
    });
  });

  describe("MuteChatSchema", () => {
    it("should accept valid datetime", () => {
      const result = MuteChatSchema.safeParse({
        mutedUntil: "2025-12-31T23:59:59Z",
      });

      expect(result.success).to.be.true;
    });

    it("should accept null (unmute)", () => {
      const result = MuteChatSchema.safeParse({ mutedUntil: null });

      expect(result.success).to.be.true;
    });

    it("should reject invalid datetime format", () => {
      const result = MuteChatSchema.safeParse({
        mutedUntil: "not-a-date",
      });

      expect(result.success).to.be.false;
    });
  });

  describe("CreateInviteSchema", () => {
    it("should accept empty object (all optional)", () => {
      const result = CreateInviteSchema.safeParse({});

      expect(result.success).to.be.true;
    });

    it("should accept valid expiresAt", () => {
      const result = CreateInviteSchema.safeParse({
        expiresAt: "2025-12-31T23:59:59Z",
      });

      expect(result.success).to.be.true;
    });

    it("should accept valid maxUses", () => {
      const result = CreateInviteSchema.safeParse({ maxUses: 10 });

      expect(result.success).to.be.true;
    });

    it("should reject non-positive maxUses", () => {
      const result = CreateInviteSchema.safeParse({ maxUses: 0 });

      expect(result.success).to.be.false;
    });

    it("should reject negative maxUses", () => {
      const result = CreateInviteSchema.safeParse({ maxUses: -1 });

      expect(result.success).to.be.false;
    });

    it("should reject non-integer maxUses", () => {
      const result = CreateInviteSchema.safeParse({ maxUses: 1.5 });

      expect(result.success).to.be.false;
    });
  });

  describe("CreateFolderSchema", () => {
    it("should accept valid name", () => {
      const result = CreateFolderSchema.safeParse({ name: "Work" });

      expect(result.success).to.be.true;
    });

    it("should reject empty name", () => {
      const result = CreateFolderSchema.safeParse({ name: "" });

      expect(result.success).to.be.false;
    });

    it("should reject name exceeding 50 chars", () => {
      const result = CreateFolderSchema.safeParse({
        name: "a".repeat(51),
      });

      expect(result.success).to.be.false;
    });
  });

  describe("MoveChatToFolderSchema", () => {
    it("should accept valid UUID", () => {
      const result = MoveChatToFolderSchema.safeParse({
        folderId: validUuid,
      });

      expect(result.success).to.be.true;
    });

    it("should accept null (remove from folder)", () => {
      const result = MoveChatToFolderSchema.safeParse({ folderId: null });

      expect(result.success).to.be.true;
    });

    it("should reject invalid UUID", () => {
      const result = MoveChatToFolderSchema.safeParse({
        folderId: "not-uuid",
      });

      expect(result.success).to.be.false;
    });
  });
});
