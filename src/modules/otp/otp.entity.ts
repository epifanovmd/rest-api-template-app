import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import type { User } from "../user/user.entity";

@Entity("otp")
export class Otp {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 6 })
  code: string;

  @Column({ name: "expire_at", type: "timestamp" })
  expireAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @ManyToOne(() => User, user => user.otps, { onDelete: "CASCADE" })
  @ManyToOne("User", "otps", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // Helper methods
  isExpired(): boolean {
    return this.expireAt < new Date();
  }

  // DTO transformation
  toDTO() {
    return {
      userId: this.userId,
      code: this.code,
      expireAt: this.expireAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // Static method for creating OTP
  static createOtp(
    userId: string,
    code: string,
    expireMinutes: number,
  ): Partial<Otp> {
    const expireAt = new Date();

    expireAt.setMinutes(expireAt.getMinutes() + expireMinutes);

    return {
      userId,
      code,
      expireAt,
    };
  }
}
