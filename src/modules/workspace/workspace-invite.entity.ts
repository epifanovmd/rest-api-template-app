import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { TOKEN_HASH_LENGTH } from "../../core";
import { User } from "../user/user.entity";
import { Workspace } from "./workspace.entity";
import {
  type TWorkspaceRole,
  WORKSPACE_INVITE_EMAIL_MAX,
} from "./workspace.types";

/**
 * Приглашение по email. Хранится только хеш токена: сам токен уходит в
 * письме и больше нигде не показывается.
 */
@Entity("workspace_invites")
@Index("IDX_WORKSPACE_INVITES_TOKEN_HASH", ["tokenHash"], { unique: true })
@Index("IDX_WORKSPACE_INVITES_WORKSPACE_EMAIL", ["workspaceId", "email"])
export class WorkspaceInvite {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @Column({ type: "varchar", length: WORKSPACE_INVITE_EMAIL_MAX })
  email!: string;

  @Column({ type: "varchar", length: 16 })
  role!: TWorkspaceRole;

  @Column({ name: "token_hash", type: "varchar", length: TOKEN_HASH_LENGTH })
  tokenHash!: string;

  @Column({ name: "invited_by", type: "uuid", nullable: true })
  invitedBy!: string | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "accepted_at", type: "timestamptz", nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: Workspace;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "invited_by" })
  inviter!: User | null;
}
