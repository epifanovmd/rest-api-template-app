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
import { DialogMembers } from "../dialog-members/dialog-members.entity";
import { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import { FcmToken } from "../fcm-token/fcm-token.entity";
import { File } from "../file/file.entity";
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

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Role, role => role.users, { onDelete: "SET NULL" })
  @JoinColumn({ name: "role_id" })
  role: Role;

  @OneToOne(() => Profile, profile => profile.user, { cascade: true })
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

  @OneToMany(() => DialogMembers, member => member.user, { cascade: true })
  dialogMemberships: DialogMembers[];

  @OneToMany(() => DialogMessages, message => message.user, { cascade: true })
  messages: DialogMessages[];

  @ManyToOne(() => File, { onDelete: "SET NULL" })
  @JoinColumn({ name: "avatar_id" })
  avatar: File | null;

  // Helper methods
  hasValidChallenge(): boolean {
    return !!this.challenge;
  }

  clearChallenge(): void {
    this.challenge = null;
  }

  setChallenge(challenge: string): void {
    this.challenge = challenge;
  }

  // DTO преобразование
  toDTO() {
    return {
      id: this.id,
      email: this.email,
      emailVerified: this.emailVerified,
      phone: this.phone,
      challenge: this.challenge,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      role: this.role?.toDTO?.(),
    };
  }

  // For authentication
  toAuthDTO() {
    return {
      id: this.id,
      email: this.email,
      emailVerified: this.emailVerified,
      phone: this.phone,
      role: this.role?.name,
    };
  }
}
