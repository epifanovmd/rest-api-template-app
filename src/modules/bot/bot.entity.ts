import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { File } from "../file/file.entity";
import { User } from "../user/user.entity";
import { BotCommand } from "./bot-command.entity";

@Entity("bots")
@Index("IDX_BOTS_OWNER", ["ownerId"])
@Index("IDX_BOTS_USER", ["userId"], { unique: true })
export class Bot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "owner_id", type: "uuid" })
  ownerId!: string;

  /**
   * Технический пользователь бота: от его имени бот состоит в чатах и
   * отправляет сообщения. Создаётся вместе с ботом, удаляется вместе с ним.
   */
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 50, unique: true })
  username!: string;

  @Column({ name: "display_name", type: "varchar", length: 100 })
  displayName!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId!: string | null;

  @Column({ type: "varchar", length: 256, unique: true })
  token!: string;

  @Column({ name: "webhook_url", type: "varchar", length: 500, nullable: true })
  webhookUrl!: string | null;

  @Column({
    name: "webhook_secret",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  webhookSecret!: string | null;

  /** Типы событий вебхука; пустой массив — все события. */
  @Column({
    name: "webhook_events",
    type: "jsonb",
    default: "[]",
  })
  webhookEvents!: string[];

  /** Подряд проваленных доставок; сбрасывается успешной доставкой и сменой вебхука. */
  @Column({ name: "webhook_failure_count", type: "int", default: 0 })
  webhookFailureCount!: number;

  /** Вебхук отключён автоматически после серии провалов; NULL — работает. */
  @Column({
    name: "webhook_disabled_at",
    type: "timestamptz",
    nullable: true,
  })
  webhookDisabledAt!: Date | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner!: User;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => File, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "avatar_id" })
  avatar!: File | null;

  @OneToMany(() => BotCommand, cmd => cmd.bot, { cascade: true })
  commands!: BotCommand[];
}
