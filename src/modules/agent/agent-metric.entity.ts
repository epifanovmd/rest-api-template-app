import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

import { bigintNumber } from "../../core";

/**
 * Точка истории метрик агента: метрики узла (`host`) и ответы `GET /metrics`
 * воркеров (`workers`). Пишется не чаще `AGENT_METRICS_STORE_INTERVAL_MS`,
 * хранится `AGENT_METRICS_RETENTION_HOURS`.
 */
@Entity("agent_metrics")
@Index("IDX_AGENT_METRICS_AGENT_AT", ["agentId", "at"])
export class AgentMetric {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ name: "agent_id", type: "varchar", length: 64 })
  agentId!: string;

  /** Время сбора на узле, мс. */
  @Column({ type: "bigint", transformer: bigintNumber })
  at!: number;

  @Column({ type: "jsonb", nullable: true })
  host!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  workers!: Record<string, unknown> | null;
}
