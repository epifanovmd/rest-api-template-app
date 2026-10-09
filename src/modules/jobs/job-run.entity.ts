import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { EJobRunStatus, IJobRunError, IJobRunOutput } from "./jobs.types";

/**
 * Видимая задача: статус, прогресс, хвост лога и отмена. Сама задача живёт в
 * pg-boss; `id` совпадает с id задачи pg-boss. Инфраструктурная таблица:
 * без внешних ключей на доменные таблицы (владелец и scope — просто id).
 */
@Entity("job_runs")
@Index("IDX_JOB_RUNS_OWNER_CREATED", ["ownerId", "createdAt"])
@Index("IDX_JOB_RUNS_SCOPE_CREATED", ["scopeType", "scopeId", "createdAt"])
@Index("IDX_JOB_RUNS_STATUS_LEASE", ["status", "leaseUntil"])
@Index("IDX_JOB_RUNS_AGENT_STATUS", ["agentId", "status"])
@Index("IDX_JOB_RUNS_EXTERNAL", ["agentId", "externalId"])
@Index("IDX_JOB_RUNS_STATUS_DEADLINE", ["status", "deadlineAt"])
export class JobRun {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 100 })
  queue!: string;

  @Column({ type: "varchar", length: 16, default: EJobRunStatus.QUEUED })
  status!: EJobRunStatus;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  /** 0..1 */
  @Column({ type: "real", default: 0 })
  progress!: number;

  /** Что делается сейчас: «кадр 120 из 500». */
  @Column({
    name: "progress_text",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  progressText!: string | null;

  /** Последние строки лога. */
  @Column({ name: "log_tail", type: "jsonb", default: () => "'[]'" })
  logTail!: string[];

  @Column({ type: "jsonb", nullable: true })
  result!: unknown;

  @Column({ type: "jsonb", nullable: true })
  error!: IJobRunError | null;

  @Column({ name: "owner_id", type: "uuid", nullable: true })
  ownerId!: string | null;

  @Column({ name: "scope_type", type: "varchar", length: 50, nullable: true })
  scopeType!: string | null;

  @Column({ name: "scope_id", type: "varchar", length: 100, nullable: true })
  scopeId!: string | null;

  /** Номер попытки, с 0. */
  @Column({ type: "int", default: 0 })
  attempt!: number;

  /** Запрошена отмена: исполнитель узнаёт сигналом (NOTIFY) или опросом. */
  @Column({ name: "cancel_requested", type: "boolean", default: false })
  cancelRequested!: boolean;

  /** До какого момента Node-воркер держит задачу; дальше её забирает reaper. */
  @Column({ name: "lease_until", type: "timestamptz", nullable: true })
  leaseUntil!: Date | null;

  /** Агент, у воркера которого выполняется внешняя задача. */
  @Column({ name: "agent_id", type: "varchar", length: 64, nullable: true })
  agentId!: string | null;

  /** Воркер агента, выполняющий внешнюю задачу. */
  @Column({ type: "varchar", length: 32, nullable: true })
  worker!: string | null;

  /** Тип задачи воркера внешней задачи (`echo.long`). */
  @Column({ name: "job_type", type: "varchar", length: 64, nullable: true })
  jobType!: string | null;

  /** Файлы итога внешней задачи: имя, ключ хранилища, размер. */
  @Column({ type: "jsonb", nullable: true })
  outputs!: IJobRunOutput[] | null;

  /** Id задачи у воркера (ответ `202 { id }`; у быстрой задачи — id записи). */
  @Column({ name: "external_id", type: "varchar", length: 128, nullable: true })
  externalId!: string | null;

  /** Срок внешней задачи: не закончилась к нему — провал `JOB_TIMEOUT`. */
  @Column({ name: "deadline_at", type: "timestamptz", nullable: true })
  deadlineAt!: Date | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
