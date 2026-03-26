import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import { ESyncAction, ESyncEntityType } from "./sync.types";

@Entity("sync_logs")
@Index("IDX_SYNC_LOGS_USER_VERSION", ["userId", "version"])
@Index("IDX_SYNC_LOGS_CHAT_VERSION", ["chatId", "version"])
export class SyncLog {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  version: string;

  @Column({ name: "entity_type", type: "enum", enum: ESyncEntityType })
  entityType: ESyncEntityType;

  @Column({ name: "entity_id", type: "uuid" })
  entityId: string;

  @Column({ type: "enum", enum: ESyncAction })
  action: ESyncAction;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  @Column({ name: "chat_id", type: "uuid", nullable: true })
  chatId: string | null;

  @Column({ type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
