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
import { Poll } from "./poll.entity";
import { PollOption } from "./poll-option.entity";

@Entity("poll_votes")
@Index("IDX_POLL_VOTES_UNIQUE", ["pollId", "optionId", "userId"], {
  unique: true,
})
export class PollVote {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "poll_id", type: "uuid" })
  pollId: string;

  @Column({ name: "option_id", type: "uuid" })
  optionId: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Poll, poll => poll.votes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "poll_id" })
  poll: Poll;

  @ManyToOne(() => PollOption, option => option.votes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "option_id" })
  option: PollOption;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
