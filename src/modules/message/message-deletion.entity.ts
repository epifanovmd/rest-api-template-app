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
import { Message } from "./message.entity";

@Entity("message_deletions")
@Index("IDX_MESSAGE_DELETIONS_MESSAGE", ["messageId"])
@Index("IDX_MESSAGE_DELETIONS_USER_MESSAGE", ["messageId", "userId"], {
  unique: true,
})
export class MessageDeletion {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @ManyToOne(() => Message, message => message.deletions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "message_id" })
  message: Message;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
