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
import { WORKSPACE_NAME_MAX, WORKSPACE_SLUG_MAX } from "./workspace.types";

/**
 * Рабочее пространство — единица multi-tenancy. `ownerId` дублирует
 * участника с ролью owner для быстрых выборок; `null` — владелец удалён и
 * владение ещё не передано (см. обработку `UserDeletedEvent`).
 */
@Entity("workspaces")
@Index("IDX_WORKSPACES_SLUG", ["slug"], { unique: true })
@Index("IDX_WORKSPACES_OWNER", ["ownerId"])
export class Workspace {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: WORKSPACE_NAME_MAX })
  name!: string;

  @Column({ type: "varchar", length: WORKSPACE_SLUG_MAX })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "owner_id", type: "uuid", nullable: true })
  ownerId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt!: Date | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "owner_id" })
  owner!: User | null;
}
