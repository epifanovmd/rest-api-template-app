import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { File } from "../file/file.entity";
import { User } from "../user/user.entity";
import { BotCommand } from "./bot-command.entity";

@Entity("bots")
@Index("IDX_BOTS_OWNER", ["ownerId"])
export class Bot {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "owner_id", type: "uuid" })
  ownerId: string;

  @Column({ type: "varchar", length: 50, unique: true })
  username: string;

  @Column({ name: "display_name", type: "varchar", length: 100 })
  displayName: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId: string | null;

  @Column({ type: "varchar", length: 256, unique: true })
  token: string;

  @Column({ name: "webhook_url", type: "varchar", length: 500, nullable: true })
  webhookUrl: string | null;

  @Column({
    name: "webhook_secret",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  webhookSecret: string | null;

  /** Which event types this bot subscribes to. Empty array = all events. */
  @Column({
    name: "webhook_events",
    type: "jsonb",
    default: "[]",
  })
  webhookEvents: string[];

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner: User;

  @ManyToOne(() => File, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "avatar_id" })
  avatar: File | null;

  @OneToMany(() => BotCommand, cmd => cmd.bot, { cascade: true })
  commands: BotCommand[];
}
