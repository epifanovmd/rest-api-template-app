import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { WgPeer } from "../wg-peer/wg-peer.entity";
import { WgServer } from "../wg-server/wg-server.entity";

/**
 * Instantaneous speed sample for a peer.
 * Calculated as delta(bytes) / delta(time) between two consecutive polls.
 */
@Entity("wg_speed_samples")
@Index("IDX_WG_SPEED_PEER_TS", ["peerId", "timestamp"])
@Index("IDX_WG_SPEED_SERVER_TS", ["serverId", "timestamp"])
export class WgSpeedSample {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "peer_id", type: "uuid" })
  peerId: string;

  @Column({ name: "server_id", type: "uuid" })
  serverId: string;

  /** Download speed in bytes/sec (server RX from this peer) */
  @Column({ name: "rx_speed_bps", type: "double precision" })
  rxSpeedBps: number;

  /** Upload speed in bytes/sec (server TX to this peer) */
  @Column({ name: "tx_speed_bps", type: "double precision" })
  txSpeedBps: number;

  /** Whether the peer was active at this sample time */
  @Column({ name: "is_active", type: "boolean" })
  isActive: boolean;

  @Column({ name: "timestamp", type: "timestamptz" })
  timestamp: Date;

  @ManyToOne(() => WgPeer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "peer_id" })
  peer: WgPeer;

  @ManyToOne(() => WgServer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "server_id" })
  server: WgServer;
}
