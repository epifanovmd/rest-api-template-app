import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { Workspace } from "./workspace.entity";
import type { TWorkspaceRole } from "./workspace.types";

/** Участник пространства и его роль. */
@Entity("workspace_members")
@Index("IDX_WORKSPACE_MEMBERS_WORKSPACE_USER", ["workspaceId", "userId"], {
  unique: true,
})
@Index("IDX_WORKSPACE_MEMBERS_USER", ["userId"])
@Index("IDX_WORKSPACE_MEMBERS_WORKSPACE_ROLE", ["workspaceId", "role"])
export class WorkspaceMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 16 })
  role!: TWorkspaceRole;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: Workspace;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;
}
