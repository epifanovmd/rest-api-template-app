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

  /** Пользователь, создавший этот сервер */
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  /** Понятное для человека название, например "Main Server" */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Имя интерфейса WireGuard, например wg0 */
  @Column({ type: "varchar", length: 20, unique: true })
  interface: string;

  /** UDP-порт, который слушает WireGuard */
  @Column({ name: "listen_port", type: "int" })
  listenPort: number;

  /** Приватный ключ WireGuard сервера */
  @Column({ name: "private_key", type: "varchar" })
  privateKey: string;

  /** Публичный ключ WireGuard сервера (производный от приватного) */
  @Column({ name: "public_key", type: "varchar" })
  publicKey: string;

  /** VPN-адрес подсети сервера, например 10.0.0.1/24 */
  @Column({ type: "varchar", length: 50 })
  address: string;

  /** DNS-сервер для пиров, например 1.1.1.1,8.8.8.8 */
  @Column({ type: "varchar", length: 100, nullable: true })
  dns: string | null;

  /** Публичный endpoint для подключения клиентов, например vpn.example.com:51820 */
  @Column({ type: "varchar", length: 255, nullable: true })
  endpoint: string | null;

  /** MTU (по умолчанию 1420) */
  @Column({ type: "int", nullable: true })
  mtu: number | null;

  /** Shell-команда, выполняемая перед поднятием интерфейса */
  @Column({ name: "pre_up", type: "text", nullable: true })
  preUp: string | null;

  /** Shell-команда, выполняемая перед остановкой интерфейса */
  @Column({ name: "pre_down", type: "text", nullable: true })
  preDown: string | null;

  /** Правило iptables PostUp */
  @Column({ name: "post_up", type: "text", nullable: true })
  postUp: string | null;

  /** Правило iptables PostDown */
  @Column({ name: "post_down", type: "text", nullable: true })
  postDown: string | null;

  /** Текущий статус интерфейса */
  @Column({
    type: "enum",
    enum: EWgServerStatus,
    default: EWgServerStatus.UNKNOWN,
  })
  status: EWgServerStatus;

  /** Включён ли данный сервер / должен ли быть запущен */
  @Column({ type: "boolean", default: true })
  enabled: boolean;

  /** Описание / заметки */
  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
