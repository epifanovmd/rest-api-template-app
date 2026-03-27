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
import { EChatType } from "./chat.types";
import { ChatMember } from "./chat-member.entity";

@Entity("chats")
@Index("IDX_CHATS_LAST_MESSAGE_AT", ["lastMessageAt"])
@Index("IDX_CHATS_USERNAME", ["username"], { unique: true, where: "username IS NOT NULL" })
export class Chat {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "enum", enum: EChatType, default: EChatType.DIRECT })
  type: EChatType;

  @Column({ type: "varchar", length: 100, nullable: true })
  name: string | null;

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId: string | null;

  @Column({ name: "created_by_id", type: "uuid", nullable: true })
  createdById: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  username: string | null;

  @Column({ name: "is_public", type: "boolean", default: false })
  isPublic: boolean;

  @Column({ name: "slow_mode_seconds", type: "integer", default: 0 })
  slowModeSeconds: number;

  @Column({
    name: "last_message_at",
    type: "timestamp",
    nullable: true,
  })
  lastMessageAt: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => File, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "avatar_id" })
  avatar: File | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User | null;

  @OneToMany(() => ChatMember, member => member.chat, { cascade: true })
  members: ChatMember[];
}
