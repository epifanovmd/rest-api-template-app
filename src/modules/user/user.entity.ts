import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Biometric } from "../biometric/biometric.entity";
import { Otp } from "../otp/otp.entity";
import { Passkey } from "../passkeys/passkey.entity";
import { Permission } from "../permission/permission.entity";
import { Profile } from "../profile/profile.entity";
import { ResetPasswordTokens } from "../reset-password-tokens/reset-password-tokens.entity";
import { Role } from "../role/role.entity";

/** Сущность пользователя системы. */
@Entity("users")
@Index("IDX_USERS_EMAIL_PHONE", ["email", "phone"], { unique: true })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  email: string;

  // Флаг подтверждения email через OTP
  @Column({ name: "email_verified", type: "boolean", default: false })
  emailVerified: boolean;

  @Column({ type: "varchar", length: 14, nullable: true })
  phone: string;

  // Bcrypt-хеш пароля пользователя
  @Column({ name: "password_hash", type: "varchar", length: 100 })
  passwordHash: string;

  // Временный WebAuthn challenge, хранится между шагами регистрации/аутентификации passkey
  @Column({ type: "varchar", nullable: true })
  challenge?: string;

  @Column({ name: "challenge_expires_at", type: "timestamp", nullable: true })
  challengeExpiresAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // ── Связи ──────────────────────────────────────────────────────────────────

  /**
   * Роли, назначенные этому пользователю.
   * Эффективные разрешения = объединение всех разрешений ролей + directPermissions.
   */
  @ManyToMany(() => Role, { eager: true })
  @JoinTable({
    name: "user_roles",
    joinColumn: { name: "user_id" },
    inverseJoinColumn: { name: "role_id" },
  })
  roles: Role[];

  /**
   * Разрешения, выданные напрямую этому пользователю (дополнительно к разрешениям ролей).
   * Полезно для точечного переопределения без создания новой роли.
   */
  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: "user_permissions",
    joinColumn: { name: "user_id" },
    inverseJoinColumn: { name: "permission_id" },
  })
  directPermissions: Permission[];

  @OneToOne(() => Profile, profile => profile.user, {
    cascade: true,
    eager: true,
  })
  profile: Profile;

  @OneToMany(() => Biometric, biometric => biometric.user, { cascade: true })
  biometrics: Biometric[];

  @OneToMany(() => Otp, otp => otp.user, { cascade: true })
  otps: Otp[];

  @OneToMany(() => ResetPasswordTokens, token => token.user, { cascade: true })
  resetPasswordTokens: ResetPasswordTokens[];

  @OneToMany(() => Passkey, passkey => passkey.user, { cascade: true })
  passkeys: Passkey[];
}
