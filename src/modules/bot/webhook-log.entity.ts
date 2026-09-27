import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Bot } from "./bot.entity";

@Entity("webhook_logs")
@Index("IDX_WEBHOOK_LOGS_BOT_CREATED", ["botId", "createdAt"])
@Index("IDX_WEBHOOK_LOGS_CREATED", ["createdAt"])
export class WebhookLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "bot_id", type: "uuid" })
  botId!: string;

  /** Доставка, к которой относится попытка; NULL — тестовый ping. */
  @Column({ name: "delivery_id", type: "uuid", nullable: true })
  deliveryId!: string | null;

  @Column({ name: "event_type", type: "varchar", length: 50 })
  eventType!: string;

  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ name: "status_code", type: "int", nullable: true })
  statusCode!: number | null;

  @Column({ type: "boolean", default: false })
  success!: boolean;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage!: string | null;

  /** Номер попытки доставки, с 1. */
  @Column({ type: "int", default: 1 })
  attempts!: number;

  @Column({ name: "duration_ms", type: "int", nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot!: Bot;
}
