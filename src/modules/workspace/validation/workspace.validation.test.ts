import "reflect-metadata";

import { expect } from "chai";

import {
  AcceptWorkspaceInviteSchema,
  ChangeWorkspaceMemberRoleSchema,
  CreateWorkspaceInviteSchema,
  CreateWorkspaceSchema,
  TransferWorkspaceOwnershipSchema,
  UpdateWorkspaceSchema,
} from "./workspace.validate";

describe("Workspace Validation Schemas", () => {
  describe("CreateWorkspaceSchema", () => {
    it("название обязательно, slug — необязателен", () => {
      expect(
        CreateWorkspaceSchema.safeParse({ name: "Team" }).success,
      ).to.equal(true);
      expect(CreateWorkspaceSchema.safeParse({ name: "  " }).success).to.equal(
        false,
      );
    });

    it("slug приводится к нижнему регистру и проверяется по формату", () => {
      const ok = CreateWorkspaceSchema.safeParse({
        name: "T",
        slug: "My-Team",
      });

      expect(ok.success && ok.data.slug).to.equal("my-team");
      expect(
        CreateWorkspaceSchema.safeParse({ name: "T", slug: "-bad" }).success,
      ).to.equal(false);
      expect(
        CreateWorkspaceSchema.safeParse({ name: "T", slug: "ab" }).success,
      ).to.equal(false);
      expect(
        CreateWorkspaceSchema.safeParse({ name: "T", slug: "a".repeat(65) })
          .success,
      ).to.equal(false);
    });

    it("название не длиннее 100", () => {
      expect(
        CreateWorkspaceSchema.safeParse({ name: "a".repeat(101) }).success,
      ).to.equal(false);
    });
  });

  it("UpdateWorkspaceSchema: пустое тело отклоняется", () => {
    expect(UpdateWorkspaceSchema.safeParse({}).success).to.equal(false);
    expect(
      UpdateWorkspaceSchema.safeParse({ archived: true }).success,
    ).to.equal(true);
  });

  it("ChangeWorkspaceMemberRoleSchema: owner не назначается", () => {
    expect(
      ChangeWorkspaceMemberRoleSchema.safeParse({ role: "admin" }).success,
    ).to.equal(true);
    expect(
      ChangeWorkspaceMemberRoleSchema.safeParse({ role: "owner" }).success,
    ).to.equal(false);
  });

  it("TransferWorkspaceOwnershipSchema: userId — uuid", () => {
    expect(
      TransferWorkspaceOwnershipSchema.safeParse({ userId: "x" }).success,
    ).to.equal(false);
  });

  it("CreateWorkspaceInviteSchema: email нормализуется, owner запрещён", () => {
    const ok = CreateWorkspaceInviteSchema.safeParse({
      email: "Bob@Example.com",
      role: "viewer",
    });

    expect(ok.success && ok.data.email).to.equal("bob@example.com");
    expect(
      CreateWorkspaceInviteSchema.safeParse({
        email: "bob@example.com",
        role: "owner",
      }).success,
    ).to.equal(false);
    expect(
      CreateWorkspaceInviteSchema.safeParse({
        email: "not-email",
        role: "viewer",
      }).success,
    ).to.equal(false);
  });

  it("AcceptWorkspaceInviteSchema: токен обязателен", () => {
    expect(
      AcceptWorkspaceInviteSchema.safeParse({ token: "" }).success,
    ).to.equal(false);
    expect(
      AcceptWorkspaceInviteSchema.safeParse({ token: "abc" }).success,
    ).to.equal(true);
  });
});
