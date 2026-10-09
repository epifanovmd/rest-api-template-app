import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import {
  NODE_AGENT_NAME_MAX,
  NODE_HOST_MAX,
  NODE_NAME_MAX,
} from "./node.types";

/**
 * Узел — машина с агентом. Статус не хранится: его вычисляют по агенту
 * (agent-sdk) и последней задаче установки или удаления.
 */
@Entity("nodes")
@Index("IDX_NODES_OWNER", ["ownerId"])
@Index("IDX_NODES_CREATED_BY", ["createdById"])
@Index("IDX_NODES_CREATED", ["createdAt"])
@Index("IDX_NODES_AGENT", ["agentId"], { unique: true })
export class Node {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: NODE_NAME_MAX })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  /** Публичный адрес узла (имя хоста или IP): SSH и проверка сети. */
  @Column({ type: "varchar", length: NODE_HOST_MAX, nullable: true })
  host!: string | null;

  /** Назначенный владелец. */
  @Column({ name: "owner_id", type: "uuid", nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "owner_id" })
  owner!: User | null;

  /** Кто создал (или выпустил токен, которым зарегистрирован агент). */
  @Column({ name: "created_by_id", type: "uuid", nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_id" })
  createdBy!: User | null;

  /** Агент узла (id агента agent-sdk); `null` — агента нет. */
  @Column({ name: "agent_id", type: "varchar", length: 64, nullable: true })
  agentId!: string | null;

  /**
   * Имя агента узла (остаётся и без агента): агент, зарегистрированный
   * заново без метки узла, находит по нему свой узел.
   */
  @Column({
    name: "agent_name",
    type: "varchar",
    length: NODE_AGENT_NAME_MAX,
    nullable: true,
  })
  agentName!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
