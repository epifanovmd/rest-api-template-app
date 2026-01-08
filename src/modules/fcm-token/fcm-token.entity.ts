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

@Entity("fcm_tokens")
@Index("IDX_FCM_TOKENS_TOKEN", ["token"], { unique: true })
@Index("IDX_FCM_TOKENS_USER", ["userId"])
export class FcmToken {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 200 })
  token: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @ManyToOne(() => User, user => user.fcmTokens, { onDelete: "CASCADE" })
  @ManyToOne("User", "fcmTokens", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // DTO transformation
  toDTO() {
    return {
      id: this.id,
      userId: this.userId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // Static method for creating FCM token
  static createToken(userId: string, token: string): Partial<FcmToken> {
    return {
      userId,
      token,
    };
  }

  // Update token (useful when token needs to be refreshed)
  updateToken(newToken: string): void {
    this.token = newToken;
  }
}
