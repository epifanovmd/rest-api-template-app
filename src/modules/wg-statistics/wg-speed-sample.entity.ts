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
 * Мгновенный сэмпл скорости для пира.
 * Вычисляется как delta(bytes) / delta(time) между двумя последовательными опросами.
 */
@Entity("wg_speed_samples")
@Index("IDX_WG_SPEED_PEER_TS", ["peerId", "timestamp"])
@Index("IDX_WG_SPEED_SERVER_TS", ["serverId", "timestamp"])
export class WgSpeedSample {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "peer_id", type: "uuid", nullable: true })
  peerId: string | null;

  @Column({ name: "server_id", type: "uuid", nullable: true })
  serverId: string | null;

  /** Скорость загрузки в байт/с (RX сервера от этого пира) */
  @Column({ name: "rx_speed_bps", type: "double precision" })
  rxSpeedBps: number;

  /** Скорость отдачи в байт/с (TX сервера к этому пиру) */
  @Column({ name: "tx_speed_bps", type: "double precision" })
  txSpeedBps: number;

  /** Был ли пир активен в момент снятия сэмпла */
  @Column({ name: "is_active", type: "boolean" })
  isActive: boolean;

  @Column({ name: "timestamp", type: "timestamptz" })
  timestamp: Date;

  @ManyToOne(() => WgPeer, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "peer_id" })
  peer: WgPeer | null;

  @ManyToOne(() => WgServer, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "server_id" })
  server: WgServer | null;
}
