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

import { Chat } from "../chat/chat.entity";
import { User } from "../user/user.entity";
import { EMessageStatus, EMessageType } from "./message.types";
import { MessageAttachment } from "./message-attachment.entity";
import { MessageMention } from "./message-mention.entity";
import { MessageReaction } from "./message-reaction.entity";

@Entity("messages")
@Index("IDX_MESSAGES_CHAT_CREATED", ["chatId", "createdAt"])
@Index("IDX_MESSAGES_SENDER", ["senderId"])
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId: string;

  @Column({ name: "sender_id", type: "uuid", nullable: true })
  senderId: string | null;

  @Column({
    type: "enum",
    enum: EMessageType,
    default: EMessageType.TEXT,
  })
  type: EMessageType;

  @Column({ type: "text", nullable: true })
  content: string | null;

  @Column({ name: "reply_to_id", type: "uuid", nullable: true })
  replyToId: string | null;

  @Column({ name: "forwarded_from_id", type: "uuid", nullable: true })
  forwardedFromId: string | null;

  @Column({
    type: "enum",
    enum: EMessageStatus,
    default: EMessageStatus.SENT,
  })
  status: EMessageStatus;

  @Column({ name: "is_edited", type: "boolean", default: false })
  isEdited: boolean;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted: boolean;

  @Column({ name: "is_pinned", type: "boolean", default: false })
  isPinned: boolean;

  @Column({ name: "pinned_at", type: "timestamp", nullable: true })
  pinnedAt: Date | null;

  @Column({ name: "pinned_by_id", type: "uuid", nullable: true })
  pinnedById: string | null;

  @Column({ name: "encrypted_content", type: "text", nullable: true })
  encryptedContent: string | null;

  @Column({ name: "encryption_metadata", type: "jsonb", nullable: true })
  encryptionMetadata: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  keyboard: unknown | null;

  @Column({ name: "link_previews", type: "jsonb", nullable: true })
  linkPreviews: Array<{
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  }> | null;

  @Column({ name: "self_destruct_seconds", type: "integer", nullable: true })
  selfDestructSeconds: number | null;

  @Column({ name: "self_destruct_at", type: "timestamp", nullable: true })
  selfDestructAt: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat: Chat;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "sender_id" })
  sender: User | null;

  @ManyToOne(() => Message, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reply_to_id" })
  replyTo: Message | null;

  @ManyToOne(() => Message, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "forwarded_from_id" })
  forwardedFrom: Message | null;

  @OneToMany(() => MessageAttachment, attachment => attachment.message, {
    cascade: true,
    eager: true,
  })
  attachments: MessageAttachment[];

  @OneToMany(() => MessageReaction, reaction => reaction.message, {
    cascade: true,
  })
  reactions: MessageReaction[];

  @OneToMany(() => MessageMention, mention => mention.message, {
    cascade: true,
    eager: true,
  })
  mentions: MessageMention[];
}
