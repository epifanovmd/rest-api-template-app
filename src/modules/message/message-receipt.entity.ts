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
import { Message } from "./message.entity";
import { EMessageStatus } from "./message.types";

/**
 * Per-user receipt для отслеживания статуса доставки/прочтения сообщения
 * каждым конкретным пользователем. Критично для групповых чатов.
 *
 * В личных чатах поле messages.status достаточно.
 * В групповых чатах messages.status отражает агрегированный статус
 * (минимальный среди всех получателей), а детали — в receipts.
 */
@Entity("message_receipts")
@Index("IDX_RECEIPTS_MESSAGE_USER", ["messageId", "userId"], { unique: true })
@Index("IDX_RECEIPTS_MESSAGE_STATUS", ["messageId", "status"])
@Index("IDX_RECEIPTS_USER_CHAT", ["userId", "chatId"])
export class MessageReceipt {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Column({ name: "chat_id", type: "uuid" })
  chatId: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: EMessageStatus,
    default: EMessageStatus.SENT,
  })
  status: EMessageStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @ManyToOne(() => Message, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message: Message;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
