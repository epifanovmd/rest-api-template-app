import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import { ESyncAction, ESyncEntityType } from "./sync.types";

/**
 * Append-only журнал изменений для инкрементальной синхронизации.
 *
 * Два scope доставки (взаимоисключающие):
 *
 *   user_id = set, scope_id = NULL  → видно ТОЛЬКО этому пользователю
 *   user_id = NULL, scope_id = set  → видно всем, кто имеет доступ к этому scope
 *
 * scope_id — generic идентификатор области видимости (chatId, folderId, и т.д.).
 * Sync система не знает ЧТО такое scope — она знает только UUID.
 * Бизнес-логика (кто имеет доступ к scope) живёт в сервисном слое.
 *
 * Компактификация: DISTINCT ON (entity_key) при чтении + фоновый cleanup.
 */
@Entity("sync_logs")
@Index("IDX_SYNC_ENTITY_KEY_VERSION", ["entityKey", "version"])
@Index("IDX_SYNC_VERSION", ["version"])
@Index("IDX_SYNC_SCOPE_VERSION", ["scopeId", "version"])
@Index("IDX_SYNC_USER_VERSION", ["userId", "version"])
@Index("IDX_SYNC_CREATED_AT", ["createdAt"])
export class SyncLog {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  version: string;

  @Column({ name: "entity_type", type: "enum", enum: ESyncEntityType })
  entityType: ESyncEntityType;

  @Column({ name: "entity_id", type: "uuid" })
  entityId: string;

  /** Составной ключ для компактификации: "{entityType}:{entityId}". */
  @Column({ name: "entity_key", type: "varchar", length: 255 })
  entityKey: string;

  @Column({ type: "enum", enum: ESyncAction })
  action: ESyncAction;

  /** User-scoped: только этот пользователь видит запись. NULL для scope-scoped. */
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  /**
   * Scope-scoped: все пользователи с доступом к этому scope видят запись.
   * Это может быть chatId, folderId, или любой другой group identifier.
   * NULL для user-scoped записей.
   */
  @Column({ name: "scope_id", type: "uuid", nullable: true })
  scopeId: string | null;

  @Column({ type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
