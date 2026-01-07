import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Biometric } from "../biometric/biometric.entity";
import { FcmToken } from "../fcm-token/fcm-token.entity";
import { Otp } from "../otp/otp.entity";
import { Passkey } from "../passkeys/passkey.entity";
import { Profile } from "../profile/profile.entity";
import { ResetPasswordTokens } from "../reset-password-tokens/reset-password-tokens.entity";
import { Role } from "../role/role.entity";

@Entity("users")
@Index("IDX_USERS_EMAIL_PHONE", ["email", "phone"], { unique: true })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  email: string;

  @Column({ name: "email_verified", type: "boolean", default: false })
  emailVerified: boolean;

  @Column({ type: "varchar", length: 14, nullable: true })
  phone: string;

  @Column({ name: "password_hash", type: "varchar", length: 100 })
  passwordHash: string;

  @Column({ type: "varchar", nullable: true })
  challenge: string | null;

  @Column({ name: "role_id", type: "uuid", nullable: true })
  roleId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Role, { onDelete: "SET NULL", eager: true })
  @JoinColumn({ name: "role_id" })
  role: Role;

  @OneToOne(() => Profile, profile => profile.user, {
    cascade: true,
    eager: true,
  })
  profile: Profile;

  @OneToMany(() => Passkey, passkey => passkey.user, { cascade: true })
  passkeys: Passkey[];

  @OneToMany(() => Biometric, biometric => biometric.user, { cascade: true })
  biometrics: Biometric[];

  @OneToMany(() => Otp, otp => otp.user, { cascade: true })
  otps: Otp[];

  @OneToMany(() => ResetPasswordTokens, token => token.user, { cascade: true })
  resetPasswordTokens: ResetPasswordTokens[];

  @OneToMany(() => FcmToken, token => token.user, { cascade: true })
  fcmTokens: FcmToken[];
}
