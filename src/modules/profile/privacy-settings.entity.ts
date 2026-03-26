import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";

export enum EPrivacyLevel {
  EVERYONE = "everyone",
  CONTACTS = "contacts",
  NOBODY = "nobody",
}

@Entity("privacy_settings")
@Index("IDX_PRIVACY_USER", ["userId"], { unique: true })
export class PrivacySettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid", unique: true })
  userId: string;

  @Column({
    name: "show_last_online",
    type: "enum",
    enum: EPrivacyLevel,
    default: EPrivacyLevel.EVERYONE,
  })
  showLastOnline: EPrivacyLevel;

  @Column({
    name: "show_phone",
    type: "enum",
    enum: EPrivacyLevel,
    default: EPrivacyLevel.CONTACTS,
  })
  showPhone: EPrivacyLevel;

  @Column({
    name: "show_avatar",
    type: "enum",
    enum: EPrivacyLevel,
    default: EPrivacyLevel.EVERYONE,
  })
  showAvatar: EPrivacyLevel;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
