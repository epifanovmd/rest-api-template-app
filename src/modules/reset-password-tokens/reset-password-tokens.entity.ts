import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import type { User } from "../user/user.entity";

@Entity("reset_password_tokens")
@Index("IDX_RESET_TOKENS_TOKEN", ["token"], { unique: true })
export class ResetPasswordTokens {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar" })
  token: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @ManyToOne(() => User, user => user.resetPasswordTokens, {
  @ManyToOne("User", "resetPasswordTokens", {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user: User;

  // DTO transformation
  toDTO() {
    return {
      userId: this.userId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // Static method for creating reset token
  static createToken(
    userId: string,
    token: string,
  ): Partial<ResetPasswordTokens> {
    return {
      userId,
      token,
    };
  }
}
