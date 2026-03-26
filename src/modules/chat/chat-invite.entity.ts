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

@Entity("chat_invites")
@Index("IDX_CHAT_INVITES_CODE", ["code"], { unique: true })
@Index("IDX_CHAT_INVITES_CHAT", ["chatId"])
export class ChatInvite {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId: string;

  @Column({ type: "varchar", length: 32, unique: true })
  code: string;

  @Column({ name: "created_by_id", type: "uuid" })
  createdById: string;

  @Column({ name: "expires_at", type: "timestamp", nullable: true })
  expiresAt: Date | null;

  @Column({ name: "max_uses", type: "int", nullable: true })
  maxUses: number | null;

  @Column({ name: "use_count", type: "int", default: 0 })
  useCount: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat: Chat;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;
}
