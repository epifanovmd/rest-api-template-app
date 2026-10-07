import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Agent } from "./agent.entity";
import { EAgentCommandStatus } from "./agent.types";

/** Ошибка команды. */
export interface IAgentCommandError {
  code: string;
  message: string;
}

/**
 * Команда агенту из белого списка, который агент объявил в `hello`.
 * Доставляется, пока `pending`; агент подтверждает (`running`) и сообщает итог.
 */
@Entity("agent_commands")
@Index("IDX_AGENT_COMMANDS_AGENT_STATUS", ["agentId", "status"])
@Index("IDX_AGENT_COMMANDS_STATUS_CREATED", ["status", "createdAt"])
export class AgentCommand {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "agent_id", type: "uuid" })
  agentId!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "jsonb", nullable: true })
  args!: unknown;

  @Column({ type: "varchar", length: 16, default: EAgentCommandStatus.PENDING })
  status!: EAgentCommandStatus;

  /** Вывод команды (хвост, не длиннее предела). */
  @Column({ type: "text", default: "" })
  output!: string;

  @Column({ type: "jsonb", nullable: true })
  result!: unknown;

  @Column({ type: "jsonb", nullable: true })
  error!: IAgentCommandError | null;

  @Column({ name: "exit_code", type: "int", nullable: true })
  exitCode!: number | null;

  @Column({ name: "timeout_sec", type: "int" })
  timeoutSec!: number;

  @Column({ name: "requested_by", type: "uuid", nullable: true })
  requestedBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt!: Date | null;

  @ManyToOne(() => Agent, { onDelete: "CASCADE" })
  @JoinColumn({ name: "agent_id" })
  agent?: Agent;
}
