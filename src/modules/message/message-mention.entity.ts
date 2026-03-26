import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Message } from "./message.entity";

@Entity("message_mentions")
@Index("IDX_MENTIONS_MESSAGE", ["messageId"])
@Index("IDX_MENTIONS_USER", ["userId"])
export class MessageMention {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  @Column({ name: "is_all", type: "boolean", default: false })
  isAll: boolean;

  @ManyToOne(() => Message, message => message.mentions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "message_id" })
  message: Message;
}
