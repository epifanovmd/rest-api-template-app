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
import { EDevicePlatform } from "./push.types";

@Entity("device_tokens")
@Index("IDX_DEVICE_TOKENS_USER", ["userId"])
@Index("IDX_DEVICE_TOKENS_TOKEN", ["token"], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 512, unique: true })
  token: string;

  @Column({ type: "enum", enum: EDevicePlatform })
  platform: EDevicePlatform;

  @Column({ name: "device_name", type: "varchar", length: 100, nullable: true })
  deviceName: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
