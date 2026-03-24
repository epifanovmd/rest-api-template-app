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
 * Периодический снимок накопленных счётчиков трафика для пира.
 * Используется для графиков, расчёта общего использования и оповещений.
 */
@Entity("wg_traffic_stats")
@Index("IDX_WG_TRAFFIC_STAT_PEER_TS", ["peerId", "timestamp"])
@Index("IDX_WG_TRAFFIC_STAT_SERVER_TS", ["serverId", "timestamp"])
export class WgTrafficStat {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "peer_id", type: "uuid", nullable: true })
  peerId: string | null;

  @Column({ name: "server_id", type: "uuid", nullable: true })
  serverId: string | null;

  /** Накопленные байты, полученные пиром (wg show rx_bytes) */
  @Column({ name: "rx_bytes", type: "bigint", transformer: { to: v => v, from: v => Number(v) } })
  rxBytes: number;

  /** Накопленные байты, отправленные пиру (wg show tx_bytes) */
  @Column({ name: "tx_bytes", type: "bigint", transformer: { to: v => v, from: v => Number(v) } })
  txBytes: number;

  /** Время последнего рукопожатия из wg show */
  @Column({ name: "last_handshake", type: "timestamptz", nullable: true })
  lastHandshake: Date | null;

  /** Текущий эндпоинт пира IP:port, если известен */
  @Column({ name: "endpoint", type: "varchar", length: 100, nullable: true })
  endpoint: string | null;

  @CreateDateColumn({ name: "timestamp" })
  timestamp: Date;

  @ManyToOne(() => WgPeer, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "peer_id" })
  peer: WgPeer | null;

  @ManyToOne(() => WgServer, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "server_id" })
  server: WgServer | null;
}
