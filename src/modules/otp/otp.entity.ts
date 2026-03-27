import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";

/** Сущность одноразового пароля (OTP) для верификации email. */
@Entity("otp")
export class Otp {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  // Числовой код подтверждения (6 цифр)
  @Column({ type: "varchar", length: 6 })
  code: string;

  // Время истечения кода
  @Column({ name: "expire_at", type: "timestamp" })
  expireAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @OneToOne(() => User, user => user.otps, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  /** Проверить, истёк ли срок действия кода. */
  isExpired(): boolean {
    return this.expireAt < new Date();
  }

  /** Преобразовать сущность OTP в DTO для передачи клиенту. */
  toDTO() {
    return {
      userId: this.userId,
      code: this.code,
      expireAt: this.expireAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /** Создать объект OTP с вычисленным временем истечения. */
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
