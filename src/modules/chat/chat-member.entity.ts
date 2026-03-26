import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { Chat } from "./chat.entity";
import { EChatMemberRole } from "./chat.types";

@Entity("chat_members")
@Index("IDX_CHAT_MEMBERS_CHAT_USER", ["chatId", "userId"], { unique: true })
@Index("IDX_CHAT_MEMBERS_USER", ["userId"])
export class ChatMember {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: EChatMemberRole,
    default: EChatMemberRole.MEMBER,
  })
  role: EChatMemberRole;

  @Column({
    name: "joined_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  joinedAt: Date;

  @Column({ name: "muted_until", type: "timestamp", nullable: true })
  mutedUntil: Date | null;

  @Column({ name: "last_read_message_id", type: "uuid", nullable: true })
  lastReadMessageId: string | null;

  @Column({ name: "is_pinned_chat", type: "boolean", default: false })
  isPinnedChat: boolean;

  @Column({ name: "pinned_chat_at", type: "timestamp", nullable: true })
  pinnedChatAt: Date | null;

  @Column({ name: "is_archived", type: "boolean", default: false })
  isArchived: boolean;

  @Column({ name: "folder_id", type: "uuid", nullable: true })
  folderId: string | null;

  @ManyToOne(() => Chat, chat => chat.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat: Chat;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
