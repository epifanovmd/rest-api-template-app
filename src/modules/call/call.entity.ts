import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Chat } from "../chat/chat.entity";
import { User } from "../user/user.entity";
import { ECallStatus, ECallType } from "./call.types";

@Entity("calls")
export class Call {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "caller_id", type: "uuid" })
  callerId: string;

  @Column({ name: "callee_id", type: "uuid" })
  calleeId: string;

  @Column({ name: "chat_id", type: "uuid", nullable: true })
  chatId: string | null;

  @Column({ type: "enum", enum: ECallType, default: ECallType.VOICE })
  type: ECallType;

  @Column({
    type: "enum",
    enum: ECallStatus,
    default: ECallStatus.RINGING,
  })
  status: ECallStatus;

  @Column({ name: "started_at", type: "timestamp", nullable: true })
  startedAt: Date | null;

  @Column({ name: "ended_at", type: "timestamp", nullable: true })
  endedAt: Date | null;

  @Column({ type: "int", nullable: true })
  duration: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "caller_id" })
  caller: User;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "callee_id" })
  callee: User;

  @ManyToOne(() => Chat, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "chat_id" })
  chat: Chat | null;
}
