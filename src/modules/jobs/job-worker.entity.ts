import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Внешний воркер, бравший задачи очереди: для статуса «кто на связи».
 * Инфраструктурная таблица; пишется при каждом `claim`.
 */
@Entity("job_workers")
@Index("IDX_JOB_WORKERS_NAME_QUEUE", ["name", "queue"], { unique: true })
@Index("IDX_JOB_WORKERS_QUEUE_SEEN", ["queue", "lastSeenAt"])
export class JobWorker {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Имя, которое сообщил воркер (хост-pid); по умолчанию — ключ API. */
  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "varchar", length: 100 })
  queue!: string;

  /** API-ключ, которым воркер представился (`apikey:<id>`). */
  @Column({ name: "key_id", type: "varchar", length: 100, nullable: true })
  keyId!: string | null;

  /** Что воркер сообщил о себе: версия SDK, устройство. */
  @Column({ type: "jsonb", default: () => "'{}'" })
  meta!: Record<string, string>;

  @Column({ name: "last_seen_at", type: "timestamptz" })
  lastSeenAt!: Date;
}
