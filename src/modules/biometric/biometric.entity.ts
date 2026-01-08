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

import type { User } from "../user/user.entity";

@Entity("biometrics")
@Index("IDX_BIOMETRICS_USER_DEVICE", ["userId", "deviceId"], { unique: true })
export class Biometric {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "device_id", type: "varchar", length: 100 })
  deviceId: string;

  @Column({ name: "public_key", type: "text" })
  publicKey: string;

  @Column({ name: "device_name", type: "varchar", length: 100, nullable: true })
  deviceName: string;

  @Column({ name: "last_used_at", type: "timestamp", nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @ManyToOne(() => User, user => user.biometrics, { onDelete: "CASCADE" })
  @ManyToOne("User", "biometrics", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
