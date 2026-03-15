import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { EWgServerStatus } from "./wg-server.types";

@Entity("wg_servers")
export class WgServer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Human-readable name, e.g. "Main Server" */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** WireGuard interface name, e.g. wg0 */
  @Column({ type: "varchar", length: 20, unique: true })
  interface: string;

  /** UDP port WireGuard listens on */
  @Column({ name: "listen_port", type: "int" })
  listenPort: number;

  /** Server's WireGuard private key */
  @Column({ name: "private_key", type: "varchar" })
  privateKey: string;

  /** Server's WireGuard public key (derived from private) */
  @Column({ name: "public_key", type: "varchar" })
  publicKey: string;

  /** Server VPN subnet address, e.g. 10.0.0.1/24 */
  @Column({ type: "varchar", length: 50 })
  address: string;

  /** DNS server for peers, e.g. 1.1.1.1,8.8.8.8 */
  @Column({ type: "varchar", length: 100, nullable: true })
  dns: string | null;

  /** Public endpoint for clients to connect, e.g. vpn.example.com:51820 */
  @Column({ type: "varchar", length: 255, nullable: true })
  endpoint: string | null;

  /** MTU (default 1420) */
  @Column({ type: "int", nullable: true })
  mtu: number | null;

  /** Shell command executed before the interface is brought up */
  @Column({ name: "pre_up", type: "text", nullable: true })
  preUp: string | null;

  /** Shell command executed before the interface is brought down */
  @Column({ name: "pre_down", type: "text", nullable: true })
  preDown: string | null;

  /** iptables PostUp rule */
  @Column({ name: "post_up", type: "text", nullable: true })
  postUp: string | null;

  /** iptables PostDown rule */
  @Column({ name: "post_down", type: "text", nullable: true })
  postDown: string | null;

  /** Current interface status */
  @Column({
    type: "enum",
    enum: EWgServerStatus,
    default: EWgServerStatus.UNKNOWN,
  })
  status: EWgServerStatus;

  /** Whether this server is enabled/should be started */
  @Column({ type: "boolean", default: true })
  enabled: boolean;

  /** Description / notes */
  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
