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
import { EMessageType } from "./message.types";
import { MessageAttachment } from "./message-attachment.entity";

@Entity("messages")
@Index("IDX_MESSAGES_CHAT_CREATED", ["chatId", "createdAt"])
@Index("IDX_MESSAGES_SENDER", ["senderId"])
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId: string;

  @Column({ name: "sender_id", type: "uuid" })
  senderId: string;

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

  @Column({ name: "is_edited", type: "boolean", default: false })
  isEdited: boolean;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat: Chat;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "sender_id" })
  sender: User;

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
}
