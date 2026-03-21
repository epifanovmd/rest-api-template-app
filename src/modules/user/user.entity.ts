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

import { Otp } from "../otp/otp.entity";
import { Passkey } from "../passkeys/passkey.entity";
import { Permission } from "../permission/permission.entity";
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
  challenge?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────

  /**
   * Roles assigned to this user.
   * Effective permissions = union of all role permissions + directPermissions.
   */
  @ManyToMany(() => Role, { eager: true })
  @JoinTable({
    name: "user_roles",
    joinColumn: { name: "user_id" },
    inverseJoinColumn: { name: "role_id" },
  })
  roles: Role[];

  /**
   * Permissions granted directly to this user (additive on top of role permissions).
   * Useful for fine-grained overrides without creating a new role.
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

  @OneToMany(() => Otp, otp => otp.user, { cascade: true })
  otps: Otp[];

  @OneToMany(() => ResetPasswordTokens, token => token.user, { cascade: true })
  resetPasswordTokens: ResetPasswordTokens[];

  @OneToMany(() => Passkey, passkey => passkey.user, { cascade: true })
  passkeys: Passkey[];
}
