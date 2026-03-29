import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";

/** Сущность токена сброса пароля. По одному токену на пользователя (PK = userId). */
@Entity("reset_password_tokens")
@Index("IDX_RESET_TOKENS_TOKEN", ["token"], { unique: true })
export class ResetPasswordTokens {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  // JWT-токен сброса пароля с ограниченным сроком действия
  @Column({ type: "varchar" })
  token: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  /** Преобразовать сущность в DTO для передачи клиенту. */
  toDTO() {
    return {
      userId: this.userId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /** Создать объект токена сброса пароля. */
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
