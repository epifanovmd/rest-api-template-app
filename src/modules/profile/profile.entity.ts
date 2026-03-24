import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { EProfileStatus } from "./profile.types";

/** Сущность профиля пользователя: личные данные и статус онлайн. */
@Entity("profiles")
@Index("IDX_PROFILES_USER_ID", ["userId"], { unique: true })
@Index("IDX_PROFILES_LAST_ONLINE", ["lastOnline"])
export class Profile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "first_name", type: "varchar", length: 40, nullable: true })
  firstName: string;

  @Column({ name: "last_name", type: "varchar", length: 40, nullable: true })
  lastName: string;

  // Дата рождения пользователя
  @Column({ name: "birth_date", type: "timestamp", nullable: true })
  birthDate: Date;

  // Пол пользователя в свободной форме
  @Column({ type: "varchar", length: 20, nullable: true })
  gender: string;

  // Текущий статус присутствия (online/offline)
  @Column({
    name: "profile_status_type",
    type: "enum",
    enum: ["online", "offline"],
    default: "offline",
  })
  status: EProfileStatus;

  // Время последнего онлайна пользователя
  @Column({ name: "last_online", type: "timestamp", nullable: true })
  lastOnline: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @OneToOne(() => User, user => user.profile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

}
