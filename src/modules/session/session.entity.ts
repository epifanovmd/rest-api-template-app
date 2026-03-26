import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../user/user.entity";

@Entity("sessions")
@Index("IDX_SESSIONS_USER", ["userId"])
@Index("IDX_SESSIONS_REFRESH_TOKEN", ["refreshToken"], { unique: true })
export class Session {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "refresh_token", type: "varchar", length: 500, unique: true })
  refreshToken: string;

  @Column({ name: "device_name", type: "varchar", length: 200, nullable: true })
  deviceName: string | null;

  @Column({ name: "device_type", type: "varchar", length: 50, nullable: true })
  deviceType: string | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 500, nullable: true })
  userAgent: string | null;

  @Column({
    name: "last_active_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  lastActiveAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
