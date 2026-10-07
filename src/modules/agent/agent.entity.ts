import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { TOKEN_HASH_LENGTH } from "../../core";
import { EAgentStatus, EAgentTransport } from "./agent.types";
import type { IAlpCapabilities, IAlpHost } from "./agent-link.protocol";

/** Сведения о хосте агента из `hello`. */
export type TAgentHost = IAlpHost;

/**
 * Агент — долгоживущий процесс на узле, связанный с бэкендом протоколом ALP.
 * Учётные данные `<id>.<secret>` выдаются при регистрации; в БД — sha256
 * секрета. Сведения о сессии (версия, возможности, хост) обновляются при
 * каждом `hello`; живое состояние (`status`, `metrics`) — в Redis.
 */
@Entity("agents")
@Index("IDX_AGENTS_STATUS_SEEN", ["status", "lastSeenAt"])
export class Agent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "jsonb", default: () => "'{}'" })
  labels!: Record<string, string>;

  @Column({ type: "varchar", length: 16, default: EAgentStatus.OFFLINE })
  status!: EAgentStatus;

  /** Реплика без постоянного тома: регистрируется при каждом старте, забывается после ухода. */
  @Column({ type: "boolean", default: false })
  ephemeral!: boolean;

  /** sha256 секрета, hex. */
  @Column({ name: "secret_hash", type: "varchar", length: TOKEN_HASH_LENGTH })
  secretHash!: string;

  /** Каким токеном зарегистрирован. */
  @Column({ name: "enrollment_token_id", type: "uuid", nullable: true })
  enrollmentTokenId!: string | null;

  /** Текущая сессия: новая сессия вытесняет прежнюю. */
  @Column({ name: "session_id", type: "uuid", nullable: true })
  sessionId!: string | null;

  @Column({ type: "varchar", length: 8, nullable: true })
  transport!: EAgentTransport | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  version!: string | null;

  /** Версия протокола текущей сессии. */
  @Column({ type: "int", nullable: true })
  protocol!: number | null;

  @Column({ type: "jsonb", nullable: true })
  host!: TAgentHost | null;

  @Column({ type: "jsonb", default: () => "'{}'" })
  capabilities!: IAlpCapabilities;

  @Column({ name: "remote_ip", type: "varchar", length: 64, nullable: true })
  remoteIp!: string | null;

  @Column({ name: "connected_at", type: "timestamptz", nullable: true })
  connectedAt!: Date | null;

  @Column({ name: "last_seen_at", type: "timestamptz", nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
