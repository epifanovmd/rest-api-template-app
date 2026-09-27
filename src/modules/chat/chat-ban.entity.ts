import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { Chat } from "./chat.entity";

/** Бан участника чата. `until = null` — бессрочный; истёкший бан не действует. */
@Entity("chat_bans")
@Index("IDX_CHAT_BANS_CHAT_USER", ["chatId", "userId"], { unique: true })
@Index("IDX_CHAT_BANS_USER", ["userId"])
export class ChatBan {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "banned_by", type: "uuid", nullable: true })
  bannedById!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  until!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat!: Chat;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "banned_by" })
  bannedBy!: User | null;
}
