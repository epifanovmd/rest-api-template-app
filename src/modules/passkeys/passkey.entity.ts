import { AuthenticatorTransportFuture } from "@simplewebauthn/types";
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

import { User } from "../user/user.entity";

export type CredentialDeviceType = "singleDevice" | "multiDevice";

@Entity("passkeys")
@Index("IDX_PASSKEYS_USER_ID", ["userId"])
@Index("IDX_PASSKEYS_USER_DEVICE", ["userId", "id"])
export class Passkey {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ name: "public_key", type: "bytea" })
  publicKey: Uint8Array;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "int" })
  counter: number;

  @Column({
    name: "device_type",
    type: "varchar",
    default: "singleDevice",
  })
  deviceType: CredentialDeviceType;

  @Column({
    type: "simple-array",
    nullable: true,
    transformer: {
      to: (value: AuthenticatorTransportFuture[] | undefined) =>
        value ? JSON.stringify(value) : null,
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  transports?: AuthenticatorTransportFuture[];

  @Column({ name: "last_used", type: "timestamp", nullable: true })
  lastUsed?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.passkeys, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // Static method for creating from verification
  static createFromVerification(
    verificationInfo: any,
    userId: string,
  ): Partial<Passkey> {
    return {
      id: verificationInfo.credential.id,
      publicKey: new Uint8Array(verificationInfo.credential.publicKey),
      userId,
      counter: verificationInfo.credential.counter,
      deviceType: verificationInfo.credentialDeviceType,
      transports: verificationInfo.credential.transports,
    };
  }
}
