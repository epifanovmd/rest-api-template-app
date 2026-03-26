import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Message } from "../message/message.entity";
import { PollOption } from "./poll-option.entity";
import { PollVote } from "./poll-vote.entity";

@Entity("polls")
export class Poll {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid", unique: true })
  messageId: string;

  @Column({ type: "varchar", length: 300 })
  question: string;

  @Column({ name: "is_anonymous", type: "boolean", default: false })
  isAnonymous: boolean;

  @Column({ name: "is_multiple_choice", type: "boolean", default: false })
  isMultipleChoice: boolean;

  @Column({ name: "is_closed", type: "boolean", default: false })
  isClosed: boolean;

  @Column({ name: "closed_at", type: "timestamp", nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToOne(() => Message, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message: Message;

  @OneToMany(() => PollOption, option => option.poll, {
    cascade: true,
    eager: true,
  })
  options: PollOption[];

  @OneToMany(() => PollVote, vote => vote.poll, { cascade: true })
  votes: PollVote[];
}
