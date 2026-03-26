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

@Entity("one_time_prekeys")
@Index("IDX_OTP_USER_UNUSED", ["userId", "isUsed"])
@Index("IDX_OTP_USER_KEY", ["userId", "keyId"], { unique: true })
export class OneTimePreKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "key_id", type: "int" })
  keyId: number;

  @Column({ name: "public_key", type: "text" })
  publicKey: string;

  @Column({ name: "is_used", type: "boolean", default: false })
  isUsed: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
