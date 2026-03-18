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

  /** Optional user who owns this peer */
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  /** Human-readable label */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Peer's WireGuard public key */
  @Column({ name: "public_key", type: "varchar" })
  publicKey: string;

  /** Peer's WireGuard private key (stored for client config generation) */
  @Column({ name: "private_key", type: "varchar" })
  privateKey: string;

  /** Optional preshared key for enhanced security */
  @Column({ name: "preshared_key", type: "varchar", nullable: true })
  presharedKey: string | null;

  /** VPN IP assigned to this peer, e.g. 10.0.0.2/32 */
  @Column({ name: "allowed_ips", type: "varchar", length: 100 })
  allowedIPs: string;

  /** Static endpoint if peer has known IP (optional) */
  @Column({ type: "varchar", length: 255, nullable: true })
  endpoint: string | null;

  /** PersistentKeepalive in seconds (optional) */
  @Column({ name: "persistent_keepalive", type: "int", nullable: true })
  persistentKeepalive: number | null;

  /** Override DNS for client config */
  @Column({ type: "varchar", length: 100, nullable: true })
  dns: string | null;

  /** Override MTU for client config */
  @Column({ type: "int", nullable: true })
  mtu: number | null;

  /** Traffic routed through the VPN in client config (default 0.0.0.0/0) */
  @Column({
    name: "client_allowed_ips",
    type: "varchar",
    length: 100,
    default: "0.0.0.0/0, ::/0",
  })
  clientAllowedIPs: string;

  /** Whether this peer is active on the WG interface */
  @Column({ type: "boolean", default: true })
  enabled: boolean;

  /** Current runtime status on the WG interface */
  @Column({
    type: "enum",
    enum: EWgServerStatus,
    default: EWgServerStatus.DOWN,
  })
  status: EWgServerStatus;

  /** Optional expiry; peer is auto-disabled after this date */
  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  /** Notes / description */
  @Column({ type: "text", nullable: true })
  description: string | null;

  /** Last WireGuard handshake time (updated by statistics service) */
  @Column({ name: "last_handshake", type: "timestamptz", nullable: true })
  lastHandshake: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => WgServer, { onDelete: "CASCADE", eager: false })
  @JoinColumn({ name: "server_id" })
  server: WgServer;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true, eager: false })
  @JoinColumn({ name: "user_id" })
  user: User | null;
}
