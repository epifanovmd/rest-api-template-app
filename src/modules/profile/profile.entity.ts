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

import { Files } from "../file/file.entity";
import { User } from "../user/user.entity";

@Entity("profiles")
@Index("IDX_PROFILES_USER_ID", ["userId"], { unique: true })
@Index("IDX_PROFILES_LAST_ONLINE", ["lastOnline"])
export class Profile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "first_name", length: 40, nullable: true })
  firstName: string;

  @Column({ name: "last_name", length: 40, nullable: true })
  lastName: string;

  @Column({ name: "birth_date", nullable: true })
  birthDate: Date;

  @Column({ length: 20, nullable: true })
  gender: string;

  @Column({ length: 50, nullable: true })
  status: string;

  @Column({ name: "last_online", nullable: true })
  lastOnline: Date;

  @Column({ name: "avatar_id", type: "uuid", nullable: true })
  avatarId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, user => user.profile)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Files, file => file.avatarProfiles)
  @JoinColumn({ name: "avatar_id" })
  avatar: Files;

  toDTO() {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      birthDate: this.birthDate,
      gender: this.gender,
      status: this.status,
      lastOnline: this.lastOnline,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      avatar: this.avatar?.toDTO(),
    };
  }
}
