import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { File } from "../file/file.entity";
import { User } from "../user/user.entity";

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
  firstName: string | null;

  @Column({ name: "last_name", type: "varchar", length: 40, nullable: true })
  lastName: string | null;

  // Дата рождения пользователя
  @Column({ name: "birth_date", type: "date", nullable: true })
  birthDate: Date | null;

  // Пол пользователя в свободной форме
  @Column({ type: "varchar", length: 20, nullable: true })
  gender: string | null;

  // Время последнего онлайна пользователя
  @Column({ name: "last_online", type: "timestamp", nullable: true })
  lastOnline: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId: string | null;

  // Связи
  @OneToOne(() => User, user => user.profile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => File, { onDelete: "SET NULL" })
  @JoinColumn({ name: "avatar_id" })
  avatar: File;
}
