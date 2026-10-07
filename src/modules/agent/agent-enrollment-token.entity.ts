import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import { TOKEN_HASH_LENGTH } from "../../core";

/**
 * Токен регистрации агентов: `<prefix>.<secret>` показывается один раз.
 * Многоразовый токен регистрирует парк машин или реплики контейнера.
 */
@Entity("agent_enrollment_tokens")
@Index("IDX_AGENT_ENROLLMENT_TOKENS_PREFIX", ["prefix"], { unique: true })
export class AgentEnrollmentToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 8 })
  prefix!: string;

  /** sha256 секрета, hex. */
  @Column({ type: "varchar", length: TOKEN_HASH_LENGTH })
  hash!: string;

  /** Метки, которые получают зарегистрированные агенты. */
  @Column({ type: "jsonb", default: () => "'{}'" })
  labels!: Record<string, string>;

  /** Сколько раз можно использовать; `NULL` — без ограничения. */
  @Column({ name: "max_uses", type: "int", nullable: true })
  maxUses!: number | null;

  @Column({ type: "int", default: 0 })
  uses!: number;

  /** Агенты по этому токену — эфемерные. */
  @Column({ type: "boolean", default: false })
  ephemeral!: boolean;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
