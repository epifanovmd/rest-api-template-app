import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { WgServer } from "../wg-server/wg-server.entity";
import { EWgServerStatus } from "../wg-server/wg-server.types";

@Entity("wg_peers")
@Index("IDX_WG_PEER_SERVER_PUBLIC_KEY", ["serverId", "publicKey"], {
  unique: true,
})
@Index("IDX_WG_PEER_SERVER_NAME", ["serverId", "name"], { unique: true })
export class WgPeer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "server_id", type: "uuid" })
  serverId: string;

  /** Опциональный пользователь, которому принадлежит этот пир */
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  /** Понятное для человека название */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Публичный ключ WireGuard пира */
  @Column({ name: "public_key", type: "varchar" })
  publicKey: string;

  /** Приватный ключ WireGuard пира (хранится для генерации клиентской конфигурации) */
  @Column({ name: "private_key", type: "varchar" })
  privateKey: string;

  /** Опциональный предварительно общий ключ для повышенной безопасности */
  @Column({ name: "preshared_key", type: "varchar", nullable: true })
  presharedKey: string | null;

  /** VPN IP, назначенный этому пиру, например 10.0.0.2/32 */
  @Column({ name: "allowed_ips", type: "varchar", length: 100 })
  allowedIPs: string;

  /** PersistentKeepalive в секундах (опционально) */
  @Column({ name: "persistent_keepalive", type: "int", nullable: true })
  persistentKeepalive: number | null;

  /** Переопределение DNS для клиентской конфигурации */
  @Column({ type: "varchar", length: 100, nullable: true })
  dns: string | null;

  /** Переопределение MTU для клиентской конфигурации */
  @Column({ type: "int", nullable: true })
  mtu: number | null;

  /** Трафик, маршрутизируемый через VPN в клиентской конфигурации (по умолчанию 0.0.0.0/0) */
  @Column({
    name: "client_allowed_ips",
    type: "varchar",
    length: 100,
    default: "0.0.0.0/0, ::/0",
  })
  clientAllowedIPs: string;

  /** Активен ли данный пир на интерфейсе WG */
  @Column({ type: "boolean", default: true })
  enabled: boolean;

  /** Текущий статус времени выполнения на интерфейсе WG */
  @Column({
    type: "enum",
    enum: EWgServerStatus,
    default: EWgServerStatus.DOWN,
  })
  status: EWgServerStatus;

  /** Опциональный срок истечения; пир автоматически отключается после этой даты */
  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  /** Заметки / описание */
  @Column({ type: "text", nullable: true })
  description: string | null;

  /** Время последнего рукопожатия WireGuard (обновляется сервисом статистики) */
  @Column({ name: "last_handshake", type: "timestamptz", nullable: true })
  lastHandshake: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @ManyToOne(() => WgServer, { onDelete: "CASCADE", eager: false })
  @JoinColumn({ name: "server_id" })
  server: WgServer;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true, eager: false })
  @JoinColumn({ name: "user_id" })
  user: User | null;
}
