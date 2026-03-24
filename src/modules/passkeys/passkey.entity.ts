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

/** Сущность WebAuthn passkey (учётные данные аутентификатора). */
@Entity("passkeys")
@Index("IDX_PASSKEYS_USER_ID", ["userId"])
export class Passkey {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  // Публичный ключ аутентификатора в формате COSE
  @Column({
    name: "public_key",
    type: "bytea",
    transformer: {
      to: (value: Uint8Array) => Buffer.from(value),
      from: (value: Buffer) => new Uint8Array(value),
    },
  })
  publicKey: Uint8Array;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // Счётчик использования для защиты от replay-атак
  @Column({ type: "int" })
  counter: number;

  // Тип устройства: singleDevice (привязан к одному) или multiDevice (синхронизированный)
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

  // Дата последнего использования passkey для входа
  @Column({ name: "last_used", type: "timestamp", nullable: true })
  lastUsed?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @ManyToOne(() => User, user => user.passkeys, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
