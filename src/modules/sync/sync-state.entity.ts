import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** Ключи служебного состояния синхронизации. */
export const SyncStateKey = {
  /** Максимальная версия, удалённая retention-очисткой. */
  RETENTION_WATERMARK: "retention_watermark",
} as const;

/**
 * Служебное состояние журнала синхронизации (key → bigint). Retention
 * хранит здесь watermark: клиент с версией ниже него мог потерять удалённые
 * записи и обязан сделать snapshot.
 */
@Entity("sync_state")
export class SyncState {
  @PrimaryColumn({ type: "varchar", length: 50 })
  key!: string;

  @Column({ type: "bigint", default: "0" })
  value!: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
