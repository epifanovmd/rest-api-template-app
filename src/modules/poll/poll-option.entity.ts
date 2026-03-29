import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Poll } from "./poll.entity";
import { PollVote } from "./poll-vote.entity";

@Entity("poll_options")
@Index("IDX_POLL_OPTIONS_POLL", ["pollId"])
export class PollOption {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "poll_id", type: "uuid" })
  pollId: string;

  @Column({ type: "varchar", length: 100 })
  text: string;

  @Column({ type: "int" })
  position: number;

  @ManyToOne(() => Poll, poll => poll.options, { onDelete: "CASCADE" })
  @JoinColumn({ name: "poll_id" })
  poll: Poll;

  @OneToMany(() => PollVote, vote => vote.option)
  votes: PollVote[];
}
