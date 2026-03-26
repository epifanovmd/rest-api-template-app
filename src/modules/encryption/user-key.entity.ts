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

@Entity("user_keys")
@Index("IDX_USER_KEYS_USER_DEVICE", ["userId", "deviceId"], { unique: true })
@Index("IDX_USER_KEYS_USER", ["userId"])
export class UserKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "device_id", type: "varchar", length: 100 })
  deviceId: string;

  @Column({ name: "identity_key", type: "text" })
  identityKey: string;

  @Column({ name: "signed_pre_key_id", type: "int" })
  signedPreKeyId: number;

  @Column({ name: "signed_pre_key_public", type: "text" })
  signedPreKeyPublic: string;

  @Column({ name: "signed_pre_key_signature", type: "text" })
  signedPreKeySignature: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
