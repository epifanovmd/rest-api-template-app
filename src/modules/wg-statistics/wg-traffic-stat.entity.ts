import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { WgPeer } from "../wg-peer/wg-peer.entity";
import { WgServer } from "../wg-server/wg-server.entity";

/**
 * Periodic snapshot of cumulative traffic counters for a peer.
 * Used for charts, total usage calculations and alerting.
 */
@Entity("wg_traffic_stats")
@Index("IDX_WG_TRAFFIC_STAT_PEER_TS", ["peerId", "timestamp"])
@Index("IDX_WG_TRAFFIC_STAT_SERVER_TS", ["serverId", "timestamp"])
export class WgTrafficStat {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "peer_id", type: "uuid" })
  peerId: string;

  @Column({ name: "server_id", type: "uuid" })
  serverId: string;

  /** Cumulative bytes received by the peer (wg show rx_bytes) */
  @Column({ name: "rx_bytes", type: "bigint", transformer: { to: v => v, from: v => Number(v) } })
  rxBytes: number;

  /** Cumulative bytes sent to the peer (wg show tx_bytes) */
  @Column({ name: "tx_bytes", type: "bigint", transformer: { to: v => v, from: v => Number(v) } })
  txBytes: number;

  /** Last handshake time from wg show */
  @Column({ name: "last_handshake", type: "timestamptz", nullable: true })
  lastHandshake: Date | null;

  /** Peer's current endpoint IP:port if known */
  @Column({ name: "endpoint", type: "varchar", length: 100, nullable: true })
  endpoint: string | null;

  @CreateDateColumn({ name: "timestamp" })
  timestamp: Date;

  @ManyToOne(() => WgPeer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "peer_id" })
  peer: WgPeer;

  @ManyToOne(() => WgServer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "server_id" })
  server: WgServer;
}
